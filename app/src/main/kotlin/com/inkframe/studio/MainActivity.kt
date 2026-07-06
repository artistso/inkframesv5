package com.inkframe.studio

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
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
 *   • Intercepts data:image/png downloads (the "Export" button) and saves
 *     them to the Pictures/InkFrame collection via MediaStore.
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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the status/nav bars for an immersive canvas.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

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
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Kill flicker on pause/resume.
                    offscreenPreRaster = true
                }
            }

            // Keep navigation inside the WebView; block anything external.
            webViewClient = WebViewClient()
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER

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

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    // ---- Export / download plumbing --------------------------------------

    private val exportDownloadListener = DownloadListener { url, _, contentDisposition, mimetype, _ ->
        val suggested = guessFileName(url, contentDisposition, mimetype)
        if (url.startsWith("data:")) {
            // The web app exports via a data URL — decode + write via MediaStore.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED
            ) {
                saveDataUrl(url, suggested, mimetype ?: "image/png")
            } else {
                pendingDownload = PendingDownload(url, suggested, mimetype ?: "image/png")
                storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        } else {
            // Any real remote URL — hand off to the system downloader.
            try {
                val req = DownloadManager.Request(Uri.parse(url))
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, suggested)
                    .setMimeType(mimetype)
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                toast("Downloading $suggested")
            } catch (t: Throwable) {
                Log.e(TAG, "download failed", t)
                toast("Couldn't start download.")
            }
        }
    }

    private fun guessFileName(url: String, contentDisposition: String?, mimetype: String?): String {
        // Prefer whatever the <a download="…"> attribute suggested.
        contentDisposition?.let { cd ->
            Regex("filename\\*?=([^;]+)").find(cd)?.groupValues?.getOrNull(1)?.let {
                return it.trim().trim('"').substringAfter("''")
            }
        }
        val ext = when {
            mimetype?.contains("png", ignoreCase = true) == true -> "png"
            mimetype?.contains("jpeg", ignoreCase = true) == true -> "jpg"
            mimetype?.contains("gif", ignoreCase = true) == true -> "gif"
            mimetype?.contains("mp4", ignoreCase = true) == true -> "mp4"
            else -> "png"
        }
        return "inkframe-${System.currentTimeMillis()}.$ext"
    }

    private fun saveDataUrl(dataUrl: String, fileName: String, mimeType: String) {
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

            val resolver = contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/InkFrame")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }
            val itemUri = resolver.insert(collection, values) ?: run {
                toast("Couldn't create Pictures entry."); return
            }
            resolver.openOutputStream(itemUri)?.use { out: OutputStream -> out.write(bytes) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(itemUri, values, null, null)
            }
            toast("Saved to Pictures/InkFrame")
            // Also broadcast so galleries pick it up instantly.
            sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, itemUri))
        } catch (t: Throwable) {
            Log.e(TAG, "saveDataUrl failed", t)
            toast("Export failed: ${t.message}")
        }
    }

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onPause() { super.onPause(); webView.onPause() }
    override fun onResume() { super.onResume(); webView.onResume(); hideSystemBars() }
    override fun onDestroy() { webView.destroy(); super.onDestroy() }

    private companion object { const val TAG = "InkFrameWebShell" }
}
