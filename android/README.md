# Android app (APK)

`frontend/public/downloads/anees.apk` is a **Trusted Web Activity**: a thin Android app that opens
https://anees-qa.site full screen. The website is the app, so site updates reach installed apps automatically;
the APK only needs rebuilding if the package settings below change.

- Package id: `site.aneesqa.app`, minimum Android 7.0 (API 24).
- The landing page's Android button downloads `/downloads/anees.apk` (headers set in `vercel.json`).
- `frontend/public/.well-known/assetlinks.json` proves the app belongs to the site (that is what removes the browser
  address bar). It holds the SHA-256 of the signing certificate. **If the signing key ever changes, update it.**

## The signing key (NOT in this repository)

The key lives outside the repo, in `anees-android-build/android.keystore`, with its password in
`anees-android-build/keystore-password.txt`. **Back both up somewhere safe.** Without them nobody can publish an
update that installs over the existing app (people would have to uninstall first), and the fingerprint in
`assetlinks.json` would have to change. Never commit them.

## Rebuilding

Uses Google's Bubblewrap (`npm i @bubblewrap/cli`; it downloads the JDK and Android SDK on first run).

1. Copy `android/twa-manifest.json` into the build folder (next to `android.keystore`).
2. Raise `appVersion` / `appVersionCode`.
3. In PowerShell, from that folder: set `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD` to the password,
   add the folder to `PATH` (Windows needs it to find `gradlew.bat`), then `npx bubblewrap build --skipPwaValidation`.
4. `app-release-signed.apk` is the result (the final Play-bundle signing step may error; it is not needed).
5. Copy it to `frontend/public/downloads/anees.apk` and deploy.
