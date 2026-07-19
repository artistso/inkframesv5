# InkFrame Studio Privacy Notes

Status: **native Android privacy boundary**  
Last updated: 2026-07-18

InkFrame Studio is designed to run offline.

## Data collection

The app does **not** collect, sell, share, or transmit personal data.

The Android application is native Kotlin / Jetpack Compose / OpenGL ES. It does not use Android WebView, a JavaScript bridge, packaged browser storage, analytics, advertising, crash-reporting, account services, or automatic upload services.

## Local data

Artwork, autosave payloads, preferences, archives, and exported files remain local to the user's device unless the user explicitly chooses a destination through Android's system file picker or sharing/storage UI.

Local storage paths include:

- native project recovery data stored in app-local Android storage;
- `.inkframe` project archives saved only when the user chooses a save destination;
- exported GIF, MP4, and PNG-sequence output written only when the user starts an export action and chooses a destination.

## Network access

The Android manifest must not request `android.permission.INTERNET`.

Normal operation requires no network connection. InkFrame has no account login, remote inference, cloud processing, advertising SDK, analytics SDK, or automatic artwork upload path.

If a future feature requires network access, it must be treated as a privacy-boundary change and reviewed before release.

## User control

Users can remove local project data by clearing app storage or uninstalling the app. Files exported through the Android picker remain wherever the user saved them and can be deleted with the system file manager or gallery tools.

## Development rule

Any code or documentation change that adds network access, remote storage, telemetry, analytics, advertising, crash reporting, accounts, or artwork upload behavior must update this file and pass explicit privacy review before release.
