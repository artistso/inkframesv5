package com.inkframe.studio

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import java.io.OutputStream

/**
 * InkFrame Studio — Android wrapper.
 *
 * The full experience is the single-file web app at `web/index.html`.
 * This Activity hosts a WebView that loads that file from the APK's assets
 * so the app looks and behaves identically on device and in a browser.
 *
 * Extras beyond a plain WebView:
 *   • Intercepts exports and saves them to shared MediaStore collections.
 *     Images land in Pictures/InkFrame; videos land in Movies/InkFrame.
 *   • Provides a tiny JavaScript bridge so Blob-based GIF/video exports work
 *     inside Android WebView, where DownloadManager cannot fetch blob: URLs.
 *   • Locks landscape orientation, hides system bars for a true canvas feel.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        pendingDownload?.let { pending ->
            if (granted || Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveDataUrl(pending.dataUrl, pending.suggestedName, pending.mimeType)
            } else {
                toast("Storage permission is required to save exports.")
            }
            pendingDownload = null
        }
    }

    private data class PendingDownload(
        val dataUrl: String,
        val suggestedName: String,
        val mimeType: String,
    )

    private var pendingDownload: PendingDownload? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the status/nav bars for an immersive canvas.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        WebView.setWebContentsDebuggingEnabled(isDebuggableBuild())

        webView = WebView(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(0xFF1A001A.toInt()) // match --violet from index.html

            with(settings) {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Kill flicker on pause/resume and keep external browsing safer.
                    offscreenPreRaster = true
                    safeBrowsingEnabled = true
                }
            }

            // Keep bundled file/data/blob navigation inside the WebView, but hand any
            // real web link to Android. This prevents a tester from getting stranded
            // away from the offline studio after tapping About/credit links.
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?,
                ): Boolean {
                    val uri = request?.url ?: return false
                    return openExternalUriIfNeeded(uri)
                }

                @Deprecated("Deprecated in Android API 24; kept for older WebView callbacks.")
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    return url?.let { openExternalUriIfNeeded(Uri.parse(it)) } ?: false
                }
            }
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER

            // Blob URLs are renderer-local and cannot be fetched by Android's
            // DownloadManager. The web app calls this bridge for Blob exports;
            // the DownloadListener below also uses it as a fallback.
            addJavascriptInterface(ExportBridge(), "InkFrameAndroidBridge")
            setDownloadListener(exportDownloadListener)
        }

        setContentView(webView)
        hideSystemBars()

        CookieManager.getInstance().setAcceptCookie(true)

        // The Gradle build mounts the repo's /web directory as the APK assets root,
        // so index.html sits directly under android_asset/.
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun isDebuggableBuild(): Boolean =
        (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    private fun openExternalUriIfNeeded(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        val staysInStudio = scheme == "file" || scheme == "data" || scheme == "blob" || scheme == "about"
        if (staysInStudio) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (t: Throwable) {
            Log.w(TAG, "No external handler for ${uri}", t)
            toast("Couldn't open link.")
            true
        }
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    // ---- Web export bridge -------------------------------------------------

    private inner class ExportBridge {
        /**
         * Called by web/index.html when it has a Blob export (GIF / MP4 / WebM).
         * Android WebView can't hand blob: URLs to DownloadManager, so the page
         * converts the Blob to base64 and passes the bytes through this bridge.
         */
        @JavascriptInterface
        fun saveBase64(base64: String, suggestedName: String?, mimeType: String?) {
            runOnUiThread {
                val resolvedName = safeFileName(suggestedName, mimeType)
                val resolvedMime = resolveMimeType(resolvedName, mimeType)
                val cleanBase64 = base64.substringAfter(',', base64)
                if (!canWriteSharedStorage()) {
                    pendingDownload = PendingDownload(
                        dataUrl = "data:$resolvedMime;base64,$cleanBase64",
                        suggestedName = resolvedName,
                        mimeType = resolvedMime,
                    )
                    storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    return@runOnUiThread
                }
                try {
                    val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                    saveBytes(bytes, resolvedName, resolvedMime)
                } catch (t: Throwable) {
                    Log.e(TAG, "saveBase64 failed", t)
                    toast("Export failed: ${t.message}")
                }
            }
        }

        /** Fallback for injected blob-url handling and future data-url exports. */
        @JavascriptInterface
        fun saveDataUrl(dataUrl: String, suggestedName: String?, mimeType: String?) {
            runOnUiThread {
                val resolvedName = safeFileName(suggestedName, mimeType)
                saveDataUrl(dataUrl, resolvedName, mimeType ?: resolveMimeType(resolvedName, null))
            }
        }
    }

    // ---- Export / download plumbing --------------------------------------

    private val exportDownloadListener = DownloadListener { url, _, contentDisposition, mimetype, _ ->
        val suggested = guessFileName(url, contentDisposition, mimetype)
        val resolvedMime = resolveMimeType(suggested, mimetype)
        when {
            url.startsWith("data:") -> {
                // Classic <a download href="data:…"> path (PNG export). Decode + write.
                saveDataUrl(url, suggested, resolvedMime)
            }
            url.startsWith("blob:") -> {
                // Fallback for Blob exports if the page did not use the bridge directly.
                saveBlobUrlFromPage(url, suggested, resolvedMime)
            }
            else -> {
                // Any real remote URL — hand off to the system downloader.
                try {
                    val req = DownloadManager.Request(Uri.parse(url))
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, suggested)
                        .setMimeType(resolvedMime)
                    (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                    toast("Downloading $suggested")
                } catch (t: Throwable) {
                    Log.e(TAG, "download failed", t)
                    toast("Couldn't start download.")
                }
            }
        }
    }

    private fun guessFileName(url: String, contentDisposition: String?, mimetype: String?): String {
        // Prefer whatever the <a download="…"> attribute suggested.
        contentDisposition?.let { cd ->
            Regex("filename\\*?=([^;]+)").find(cd)?.groupValues?.getOrNull(1)?.let {
                return safeFileName(it.trim().trim('"').substringAfter("''"), mimetype)
            }
        }
        val ext = extensionForMime(mimetype) ?: when {
            url.contains(".webm", ignoreCase = true) -> "webm"
            url.contains(".mp4", ignoreCase = true) -> "mp4"
            url.contains(".gif", ignoreCase = true) -> "gif"
            url.contains(".jpg", ignoreCase = true) || url.contains(".jpeg", ignoreCase = true) -> "jpg"
            else -> "png"
        }
        return "inkframe-${System.currentTimeMillis()}.$ext"
    }

    private fun saveBlobUrlFromPage(blobUrl: String, fileName: String, mimeType: String) {
        // Blob URLs live inside the WebView renderer process. Ask the page to
        // fetch its own blob, convert to a data URL, then call the bridge above.
        val js = """
            (function(){
              fetch(${jsString(blobUrl)})
                .then(function(r){ return r.blob(); })
                .then(function(blob){
                  var reader = new FileReader();
                  reader.onloadend = function(){
                    window.InkFrameAndroidBridge.saveDataUrl(String(reader.result || ''), ${jsString(fileName)}, ${jsString(mimeType)});
                  };
                  reader.onerror = function(){ console.error('[InkFrameAndroid] blob export read failed'); };
                  reader.readAsDataURL(blob);
                })
                .catch(function(e){ console.error('[InkFrameAndroid] blob export failed', e); });
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
        toast("Preparing export…")
    }

    private fun saveDataUrl(dataUrl: String, fileName: String, mimeType: String) {
        if (!canWriteSharedStorage()) {
            pendingDownload = PendingDownload(dataUrl, fileName, mimeType)
            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            return
        }
        try {
            val comma = dataUrl.indexOf(',')
            if (comma < 0) { toast("Export failed."); return }
            val header = dataUrl.substring(0, comma)
            val payload = dataUrl.substring(comma + 1)
            val bytes = if (header.contains(";base64")) {
                Base64.decode(payload, Base64.DEFAULT)
            } else {
                Uri.decode(payload).toByteArray(Charsets.ISO_8859_1)
            }
            val dataUrlMime = Regex("^data:([^;,]+)").find(header)?.groupValues?.getOrNull(1)
            val resolvedMime = resolveMimeType(fileName, mimeType.takeIf { it.isNotBlank() } ?: dataUrlMime)
            saveBytes(bytes, safeFileName(fileName, resolvedMime), resolvedMime)
        } catch (t: Throwable) {
            Log.e(TAG, "saveDataUrl failed", t)
            toast("Export failed: ${t.message}")
        }
    }

    private fun saveBytes(bytes: ByteArray, fileName: String, mimeType: String) {
        val cleanName = safeFileName(fileName, mimeType)
        val cleanMime = resolveMimeType(cleanName, mimeType)
        val isVideo = isVideoExport(cleanName, cleanMime)
        val isImage = isImageExport(cleanName, cleanMime)
        val relativeRoot = when {
            isVideo -> Environment.DIRECTORY_MOVIES
            isImage -> Environment.DIRECTORY_PICTURES
            else -> Environment.DIRECTORY_DOWNLOADS
        }
        val destinationLabel = when {
            isVideo -> "Movies/InkFrame"
            isImage -> "Pictures/InkFrame"
            else -> "Downloads/InkFrame"
        }

        try {
            val resolver = contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName)
                put(MediaStore.MediaColumns.MIME_TYPE, cleanMime)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "$relativeRoot/InkFrame")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }
            val collection = when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && isVideo ->
                    MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && isImage ->
                    MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                isVideo -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                isImage -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                else -> MediaStore.Files.getContentUri("external")
            }
            val itemUri = resolver.insert(collection, values) ?: run {
                toast("Couldn't create export file."); return
            }
            resolver.openOutputStream(itemUri)?.use { out: OutputStream -> out.write(bytes) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
                resolver.update(itemUri, done, null, null)
            }
            toast("Saved to $destinationLabel")
            // Also broadcast so galleries pick it up instantly on older devices.
            sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, itemUri))
        } catch (t: Throwable) {
            Log.e(TAG, "saveBytes failed", t)
            toast("Export failed: ${t.message}")
        }
    }

    private fun canWriteSharedStorage(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED

    private fun resolveMimeType(fileName: String, mimeType: String?): String {
        val cleaned = mimeType
            ?.substringBefore(';')
            ?.trim()
            ?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
        if (cleaned != null) return cleaned
        return when (fileName.substringAfterLast('.', "").lowercase()) {
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "mp4", "m4v" -> "video/mp4"
            "webm" -> "video/webm"
            "zip" -> "application/zip"
            else -> "application/octet-stream"
        }
    }

    private fun safeFileName(name: String?, mimeType: String?): String {
        val base = name
            ?.substringAfterLast('/')
            ?.substringAfterLast('\\')
            ?.replace(Regex("[\\r\\n\\u0000]"), "")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: "inkframe-${System.currentTimeMillis()}.${extensionForMime(mimeType) ?: "png"}"
        return if ('.' in base) base else "$base.${extensionForMime(mimeType) ?: "png"}"
    }

    private fun extensionForMime(mimeType: String?): String? = when {
        mimeType == null -> null
        mimeType.contains("png", ignoreCase = true) -> "png"
        mimeType.contains("jpeg", ignoreCase = true) || mimeType.contains("jpg", ignoreCase = true) -> "jpg"
        mimeType.contains("gif", ignoreCase = true) -> "gif"
        mimeType.contains("webp", ignoreCase = true) -> "webp"
        mimeType.contains("mp4", ignoreCase = true) -> "mp4"
        mimeType.contains("webm", ignoreCase = true) -> "webm"
        mimeType.contains("zip", ignoreCase = true) -> "zip"
        else -> null
    }

    private fun isVideoExport(fileName: String, mimeType: String): Boolean =
        mimeType.startsWith("video/") ||
            fileName.endsWith(".mp4", ignoreCase = true) ||
            fileName.endsWith(".webm", ignoreCase = true)

    private fun isImageExport(fileName: String, mimeType: String): Boolean =
        mimeType.startsWith("image/") ||
            listOf(".png", ".jpg", ".jpeg", ".gif", ".webp").any { fileName.endsWith(it, ignoreCase = true) }

    private fun jsString(value: String): String = buildString {
        append('"')
        for (ch in value) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
        append('"')
    }

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onPause() { super.onPause(); webView.onPause() }
    override fun onResume() { super.onResume(); webView.onResume(); hideSystemBars() }
    override fun onDestroy() { webView.destroy(); super.onDestroy() }

    private companion object { const val TAG = "InkFrameWebShell" }
}
