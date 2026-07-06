# InkFrame Studio Privacy Notes

InkFrame Studio is designed to run offline.

## Data collection

The app does **not** collect, sell, share, or transmit personal data. The bundled web app
runs locally inside the browser or Android WebView and does not call a remote analytics,
advertising, crash-reporting, or account service.

## Local data

Artwork, autosave payloads, preferences, and exported files are stored locally on the
user's device:

- Web/PWA autosave uses the browser's IndexedDB storage.
- Android exports are written only when the user taps an export action; images are saved
  to `Pictures/InkFrame` and videos to `Movies/InkFrame` through Android MediaStore.
- The Android shell may request legacy write-storage permission only on Android 9 and
  older, solely to save user-requested exports to shared storage.

## Network access

The Android manifest includes the `INTERNET` permission for future compatibility, but the
current bundled app is fully offline and does not make network requests as part of normal
operation.

## User control

Users can delete exported files from their gallery/file manager and can clear browser app
storage to remove autosaves and preferences.

_Last updated: 2026-07-06_
