# Changelog

All notable changes to Fling are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-06-14

Initial public release on npm and GitHub.

### MCP server (`@0xhayd3n/fling`)

Build, deploy, observe:

- `list_devices`, `build_app`, `install_app`, `launch_app`, `stop_app`, `uninstall_app`, `read_logs`, `screenshot`, `deploy_and_run`.

UI navigation primitives (fold `dump_ui` + filter + `input_tap` round-trips into single calls):

- `dump_ui`, `tap_by_text`, `tap_by_resource_id`, `tap_by_content_desc`, `long_press_by_text`, `tap_text_verified`, `wait_for`, `scroll_until_visible`, `find_on_screen`, `dismiss_dialog`.

Intent shortcuts (for destinations reachable by a known Android intent):

- `open_setting`, `launch_settings`.

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

[Unreleased]: https://github.com/0xHayd3n/Fling/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/0xHayd3n/Fling/releases/tag/v0.6.0
