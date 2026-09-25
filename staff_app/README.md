# Sri Andal Staff — Android & Windows app

Staff-only app (not for customers) for sriandaltraders.co.in: dashboard, billing (POS),
online orders, deliveries, products & stock, customers, dues, reports and staff.
Every screen and button follows the signed-in person's role and permissions — the
same permissions as the website (the app calls the same APIs with an app token).

**Works offline.** Data is kept on the device; every change (a bill, a delivery,
a due payment, a stock update…) goes into an outbox with its own id and is sent
automatically — in order and exactly once — as soon as the connection is back.

- Flutter **3.38.10** (pinned; the dev Mac runs macOS 13).
- `lib/core/` — API client, on-device store, outbox + sync engine, permissions, theme.
- `lib/features/` — one folder per section.
- `test/screens_test.dart` — renders every screen with sample data:
  `flutter test --update-goldens test/screens_test.dart` → `test/goldens/*.png`.

## Releases
GitHub Actions (`.github/workflows/staff-app.yml`) builds the signed APK and the
Windows installer and publishes a GitHub Release `staff-app-v<version>` on every
push to `staff_app/`. Bump `version:` in `pubspec.yaml` for each new release.
Staff download it from **Admin → Staff App**; the app shows an "update available"
bar when a newer release exists.

The Android signing key is **not** in this repository — it is added as GitHub
secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`).
