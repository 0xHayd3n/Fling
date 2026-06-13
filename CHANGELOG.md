# Changelog

All notable changes to Fling are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 0.7.0 — 2026-06-14

### Added
- New `forward_cdp` tool — set up an `adb forward` from a local port to a debuggable Chromium target on the device (WebView in a hybrid app, or Chrome). Returns a CDP connect URL suitable for [Crabby](https://github.com/0xHayd3n/Crabby) or any CDP-aware tool.
- `deploy_and_run` gains an opt-in `expose_cdp` flag. When `true`, after a successful launch Fling exposes the app's WebView over CDP and surfaces the connect URL in the response's `cdp` field. CDP failures do not fail the overall deploy.
- New error codes: `CDP_APP_NOT_RUNNING`, `CDP_NO_TARGETS`, `CDP_WEBVIEW_NOT_DEBUGGABLE`, `CDP_FORWARD_FAILED`, `CDP_PROBE_FAILED`. The `WEBVIEW_NOT_DEBUGGABLE` error includes a copy-pasteable `setWebContentsDebuggingEnabled` snippet.
- Internal: `src/cdp.ts` (pure parsers + thin ADB/fetch wrappers + `exposeCdp` composite), `src/cdpForwards.ts` (server-level forward registry torn down on shutdown).

## [0.6.1] — 2026-06-14

### Fixed
- Published tarball now ships `README.md` and `LICENSE`. The 0.6.0 publish silently dropped both because they only existed at the repo root, not under `packages/mcp-server/`. The npm package page now renders documentation instead of showing only the `description` field.

## [0.6.0] — 2026-06-14

Initial public release on npm and GitHub.

### MCP server (`@0xhayd3n/fling`)

Build, deploy, observe:

- `list_devices`, `build_app`, `install_app`, `launch_app`, `stop_app`, `uninstall_app`, `read_logs`, `screenshot`, `deploy_and_run`.

UI navigation primitives (fold `dump_ui` + filter + `input_tap` round-trips into single calls):

- `dump_ui`, `tap_by_text` (with optional `hold_ms` for long-press), `tap_by_resource_id`, `tap_by_content_desc`, `tap_text_verified`, `wait_for`, `scroll_until_visible`, `find_on_screen`, `dismiss_dialog`.

Intent shortcuts (for destinations reachable by a known Android intent):

- `open_setting` (accepts a friendly `panel` name or an explicit `android.settings.*` `action`).

Composite probes (batched calls that fold multiple round-trips into one):

- `device_state`, `screenshot_with_ui`, `launch_and_wait`.

Wireless ADB pairing (cable-free dev setup):

- `start_pair_qr`, `wait_for_pair`.

### Fling Desktop (`apps/desktop`, private)

- Electron + Vite + React shell with mirror, deploy panel, device list.
- QR-scan and pin-code pairing flows; auto-reconnect on launch for previously paired devices.
- Phone-shaped window: aspect-locked shell, transparent corners, follows the mirrored device's real aspect ratio.

### Internal

- Server version is now derived from `package.json` at runtime instead of hardcoded.
- Repository at https://github.com/0xHayd3n/Fling, package published under the `@0xhayd3n` scope.

[Unreleased]: https://github.com/0xHayd3n/Fling/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/0xHayd3n/Fling/releases/tag/v0.6.1
[0.6.0]: https://github.com/0xHayd3n/Fling/releases/tag/v0.6.0
