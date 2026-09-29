# Sri Andal Admin — Windows desktop app

A Tauri v2 app that opens the **live admin website** (`https://admin.sriandaltraders.co.in`) in a native
Windows window. Every page, the sidebar, header, colours and CSS are the website's own — a change on the
website shows in the app at once, no app update needed.

## What the app adds

| | Where |
|---|---|
| Native window: Windows frame, snap, remembered size/position, one instance only | `src-tauri/src/lib.rs` |
| Page title in the taskbar; pop-ups (invoice/receipt print) as app windows; other sites open in the browser | `src-tauri/src/lib.rs` |
| Every admin page opens offline (pages + their scripts saved in the background) | `public/desktop-sw.js` (website) |
| Changes made offline are queued and sent in order when the internet is back — each once only (Idempotency-Key) | `public/desktop-sw.js` |
| Online / Offline / “N waiting” chip, list of queued and refused changes (retry / discard) | `src/components/admin/DesktopBridge.tsx` (website) |
| Windows notifications + flashing taskbar for new online orders / deliveries (only while online) | `src/components/admin/AdminLiveUpdates.tsx` |
| “New version of the app” notice | `public/app/desktop-latest.json` on the server |

The till (Billing / POS) keeps its own offline bill queue (`src/lib/pos-offline.ts`, `public/pos-sw.js`).
These features switch on only inside the app (`window.__TAURI_INTERNALS__`); browsers are unaffected.

## Build

Windows installers are built by GitHub Actions (`.github/workflows/desktop-app.yml`) on every push that
touches `desktop/`. Output: Release **desktop-app-v&lt;version&gt;** with `SriAndalAdmin-<v>-setup.exe`,
`SriAndalAdmin-<v>.msi` and `SHA256SUMS.txt`.

Release a new version:
1. Bump `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml`, `package.json`).
2. Push. When the workflow is green, copy the setup `.exe` to the server `public/files/app/` and write
   `public/app/desktop-latest.json`: `{"version":"1.0.1","url":"https://admin.sriandaltraders.co.in/files/app/SriAndalAdmin-1.0.1-setup.exe"}`.

Local run on a Windows PC: install Rust + Node, then `cd desktop && npm install && npx tauri dev`.

## Unknown publisher warning

The installer is not code-signed yet, so Windows SmartScreen shows “Windows protected your PC” → *More info*
→ *Run anyway*. To remove it, buy an Authenticode code-signing certificate (OV, or EV for instant trust),
then add `bundle.windows.certificateThumbprint` (or a signing command) in `tauri.conf.json` and the
certificate to the build machine / GitHub secrets.
