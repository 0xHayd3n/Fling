# Fling

[![CI](https://github.com/0xHayd3n/Fling/actions/workflows/ci.yml/badge.svg)](https://github.com/0xHayd3n/Fling/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@0xhayd3n/fling.svg)](https://www.npmjs.com/package/@0xhayd3n/fling)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**An MCP server for deploying, running, and observing Android apps from any MCP client (Claude Code, Cursor, VS Code).**

> "Build my app and run it on my phone."

Fling wraps `adb` (the Android Debug Bridge) behind the [Model Context Protocol](https://modelcontextprotocol.io) so an AI assistant can drive the full build → install → launch → observe loop on a connected (or wirelessly paired) Android device. You describe the outcome; the assistant calls Fling's tools to get there.

---

## Status

**Phase 1 shipped and extended.** The original nine deploy/observe tools are live and Native-Gradle-first; on top of them Fling now exposes a layer of UI navigation primitives (`tap_by_text`, `dump_ui`, …), an intent shortcut (`open_setting`), and batched composite tools (`device_state`, `screenshot_with_ui`, `launch_and_wait`) designed so an agent can drive an Android device in single-shot calls instead of round-tripping screenshot → reason → tap. See `PLAN.md` for the full roadmap.

| Category | Tools |
|---|---|
| Build & deploy | `list_devices`, `build_app`, `install_app`, `launch_app`, `stop_app`, `uninstall_app`, `read_logs`, `screenshot`, `deploy_and_run` |
| UI navigation | `dump_ui`, `tap_by_text`, `tap_by_resource_id`, `tap_by_content_desc`, `tap_text_verified`, `find_on_screen`, `wait_for`, `scroll_until_visible`, `dismiss_dialog` |
| Intent shortcuts | `open_setting` |
| Composite probes | `device_state`, `screenshot_with_ui`, `launch_and_wait`, `deploy_and_run` |
| Wireless pairing | `start_pair_qr`, `wait_for_pair` |

---

## Setup (one-time)

### 1. Install Android Platform Tools (provides `adb`)

| OS | Command |
|---|---|
| Windows | `winget install Google.PlatformTools` |
| macOS | `brew install --cask android-platform-tools` |
| Linux | `sudo apt install android-tools-adb` (Debian/Ubuntu) or your distro's equivalent |

Verify with `adb version`. On Windows you may need to open a fresh terminal so PATH picks up the new install.

### 2. Enable USB Debugging on the phone

1. Settings → About Phone → tap **Build Number** seven times.
2. Settings → Developer Options → enable **USB Debugging**.

### 3. Plug in and authorize

Connect the phone via USB. Accept the RSA fingerprint prompt that appears on the phone. Confirm with:

```
adb devices
```

You should see your device listed as `device` (not `unauthorized` or `offline`).

### 3a. Or pair wirelessly (alternative to USB)

If you'd rather not use a cable:

1. Phone: Settings → System → Developer options → enable **Wireless debugging**.
2. Open the Fling desktop app and click **Pair wirelessly →** in the hero card.
3. On the phone, tap **Pair device with QR code** and scan the QR shown in the desktop modal.

The pairing is remembered. On future launches Fling reconnects silently as long as the phone is on the same WiFi.

### 4. Install Fling

```
npm install -g @0xhayd3n/fling
```

Or use it directly with `npx`.

### 5. Add to your MCP client

**Claude Code** (`~/.claude.json` or `.mcp.json` in a project):

```json
{
  "mcpServers": {
    "fling": {
      "command": "npx",
      "args": ["-y", "@0xhayd3n/fling"]
    }
  }
}
```

**Cursor / VS Code MCP**: same shape, in their respective MCP server config.

Restart the client. The `list_devices` tool should appear.

---

## Project configuration

Fling looks for project defaults so you don't have to pass `apk_path`, `package_name`, etc. on every call. It walks up from the MCP server's cwd looking for:

1. **`fling.config.json`** in the project root, **or**
2. a **`"fling": { ... }` key in `package.json`**.

The first hit wins. All fields are optional — Fling has sensible defaults.

```json
{
  "gradleTask": "assembleDebug",
  "buildCwd": ".",
  "apkPath": "app/build/outputs/apk/debug/app-debug.apk",
  "apkGlob": "**/outputs/apk/**/*.apk",
  "packageName": "com.example.app",
  "mainActivity": ".MainActivity",
  "buildCommand": null
}
```

| Field | Default | Meaning |
|---|---|---|
| `gradleTask` | `assembleDebug` | Gradle task to run for `build_app` / `deploy_and_run`. |
| `buildCwd` | config file directory | Where to look for `gradlew` and run the build. Relative paths resolve against the config dir. |
| `apkPath` | — | Explicit APK to install. Wins over `apkGlob`. |
| `apkGlob` | `**/outputs/apk/**/*.apk` | Pattern under `buildCwd`. The newest match by mtime wins. |
| `packageName` | — | Default package for `launch_app` / `deploy_and_run`. |
| `mainActivity` | — | Optional default activity. Leading dot = package-relative (`.MainActivity`). |
| `buildCommand` | — | Escape hatch. Replaces gradle entirely. String (split on whitespace) or array. |

## Tools

### Device targeting

Every tool except `list_devices` accepts an optional `device_id`. Resolution priority:

1. Explicit `device_id` argument.
2. The `ANDROID_SERIAL` environment variable.
3. Auto-pick the single ready (`state: "device"`) device.

When 0 or 2+ ready devices exist and no explicit id is given, the tool returns a `NO_DEVICE`, `NO_READY_DEVICE`, or `MULTIPLE_DEVICES` error with guidance.

### `list_devices`

Show every Android device adb can see, including unauthorized and offline ones. Returns both human-readable text and structured JSON (`devices[]`, `count`).

**Use it when:** confirming a phone is reachable before any deploy/install/log operation.

**Output states:**

| State | Meaning |
|---|---|
| `device` | Ready for use. |
| `unauthorized` | Phone hasn't accepted the RSA prompt yet. |
| `offline` | adb sees the device but it's not responding. |
| `no permissions` | adb can't access USB (typically a Linux udev issue). |

### `build_app`

Run the project's build. By default invokes the Gradle wrapper (`./gradlew assembleDebug` or `gradlew.bat assembleDebug`) at the project root. Returns the discovered APK on success.

**Inputs:** `cwd?` (where to start config lookup; defaults to the server's cwd).

**Errors:** `BUILD_TOOL_NOT_FOUND` (no wrapper, no `gradle` on PATH), `BUILD_TIMEOUT` (default 10 min), `BUILD_FAILED` (with the extracted "What went wrong" block from gradle).

### `install_app`

Push an APK to a device and install it (`adb install -r [-g]`). Reinstall by default (keeps app data).

**Inputs:** `apk_path?` (optional — falls back to `config.apkPath` or `config.apkGlob` auto-discovery), `device_id?`, `reinstall?` (default true), `grant_runtime_permissions?` (default false), `cwd?`.

**On failure**, returns the parsed `INSTALL_FAILED_*` code plus an actionable hint — e.g. signing-mismatch suggests `uninstall_app` first, version-downgrade suggests bumping `versionCode`.

### `launch_app`

Start an installed app. Two modes:

- **No activity given:** `adb shell monkey -p <pkg> -c LAUNCHER 1` — fires the default launcher intent.
- **Activity given:** `adb shell am start -W -n <pkg>/<activity>` — wait-mode, returns launch timing.

**Inputs:** `package_name?` (optional — falls back to `config.packageName`), `activity?` (falls back to `config.mainActivity`), `device_id?`, `cwd?`.

Package and activity names are validated against Java identifier rules at the tool boundary.

### `read_logs`

Snapshot of `adb logcat -d` (dump-and-exit, no streaming). Returns the last N lines with optional filters.

**Inputs:** `package_name?` (resolves to PIDs via `pidof`), `tag?`, `priority?` (V/D/I/W/E/F), `lines?` (default 200, max 5000), `device_id?`.

When `package_name` is given but the app isn't running, returns `success: false` and an empty `logs` string — not an error.

### `stop_app`

Force-stop every process of the named app via `adb shell am force-stop`. Idempotent — calling on a stopped app is a no-op.

**Inputs:** `package_name?` (falls back to config), `device_id?`, `cwd?`.

### `uninstall_app`

Remove an installed app via `adb uninstall`. Pass `keep_data: true` to keep the app's `/data` and `/cache` directories (adb's `-k`).

**Inputs:** `package_name?`, `keep_data?`, `device_id?`, `cwd?`.

If the app wasn't installed, returns `success: false` with `already_absent: true` and is NOT flagged as an error — uninstalling something that's already gone is fine.

### `screenshot`

Capture a PNG via `adb exec-out screencap -p`. Returns the image inline as MCP image content so the assistant can see it. Pass `save_to` to also write a copy to disk.

**Inputs:** `device_id?`, `save_to?` (host path, relative to MCP server cwd).

### UI navigation tools

Semantic primitives that fold `dump_ui + filter + input_tap` round-trips into single calls. Use these instead of computing tap coordinates by hand from a screenshot.

| Tool | One-liner |
|---|---|
| `dump_ui` | Capture the visible Android view hierarchy via `uiautomator dump`. Returns a flat node list with text, content-desc, resource-id, bounds, and pre-computed centers. Defaults to `interactive_only: true`. |
| `tap_by_text` | Tap the smallest clickable element containing the given visible text. Optional `scroll_into_view` swipes up to 5 times searching for the element. Pass `hold_ms` to long-press for that many milliseconds instead of tapping (for context menus and drag handles). |
| `tap_by_resource_id` | Tap by exact Android resource id — most robust when the id is known. |
| `tap_by_content_desc` | Tap by accessibility label — used for icon buttons with no visible text. |
| `tap_text_verified` | Atomic tap-and-check: find a text node, tap its center, then poll the UI for an `expect` substring to appear or a `gone` substring to disappear. Returns `{tapped, verified, before_node}`. |
| `wait_for` | Poll `dump_ui` until a selector matches, or throw `UI_WAIT_TIMEOUT`. Use after app launches and async transitions. |
| `scroll_until_visible` | Swipe up/down up to `max_scrolls` times searching for an element. Returns `{found: false}` when exhausted — not an error. |
| `find_on_screen` | Pure query (no action). Returns up to 20 matches with their bounds and centers. Used to assert state, disambiguate, or check visibility. |
| `dismiss_dialog` | Tap the first deny/cancel/skip-style button. One dialog per call. |

Every tool here accepts `device_id?` and follows the standard Fling device-resolution rules. Their descriptions on the MCP wire include cross-pointers — e.g. `tap_by_text` says "prefer `tap_by_resource_id` for robust targeting; prefer `tap_by_content_desc` for icon buttons" — so a navigating agent picks the cheapest correct tool without re-deriving the taxonomy each turn. Costs are tuned so the inner loop can run on a smaller model (e.g. Haiku, Sonnet) without context bloat.

### Intent shortcuts

For destinations reachable by a known Android intent, `am start` is ~10× faster than tap-walking through the UI.

| Tool | One-liner |
|---|---|
| `open_setting` | Open a built-in Settings screen. Pass `panel` (friendly name: `wifi`, `bluetooth`, `apps`, `display`, `sound`, `battery`, `storage`, `location`, `security`, `developer`, `about`, `date`, `language`, `accessibility`, `notifications`) **or** `action` (allowlisted `android.settings.*` suffix like `WIFI_SETTINGS`). Optional `data_uri` accepts `package:<dotted-id>` for `APPLICATION_DETAILS_SETTINGS`. |

### Composite probes

Batched calls that fold multiple `adb`/MCP round-trips into one. Use these instead of stitching primitives when you need the whole state at once.

| Tool | One-liner |
|---|---|
| `device_state` | Single shell invocation returns foreground package + activity, screen on/off (modern `mWakefulness` with legacy `Display Power` fallback), orientation, and the last 50 logcat lines. Sectioned by `##MARKER` lines and parsed host-side. |
| `screenshot_with_ui` | Captures the PNG and the parsed UI hierarchy from the same moment, in parallel. Halves round-trips when both visual and semantic data are needed. |
| `launch_and_wait` | Launches a package via monkey, then polls `dump_ui` until a `readyWhen` selector (by text or resource id) appears; throws `UI_WAIT_TIMEOUT` if not. Returns `{ready, attempts}`. Saves the launch → poll → check round-trip. |

### `deploy_and_run`

The convenience tool: build → resolve APK → resolve device → install → launch, in one call. Stops at the first failed step and reports per-step timing.

**Inputs:** all optional. `skip_build` reuses an existing APK; `apk_path`, `package_name`, `activity`, `device_id`, `reinstall`, `grant_runtime_permissions`, `cwd` all override their config / autodetect defaults.

**Output**: `success`, `device_id`, `apk_path`, `package_name`, and `steps[]` — each step records `name`, `success`, `duration_ms`, `message`.

This is what gets called when someone says *"run this on my phone."*

---

## Development

```
git clone https://github.com/0xHayd3n/Fling.git
cd Fling
npm run setup       # installs root, packages/mcp-server, apps/desktop
npm run build       # build the MCP server (tsc → packages/mcp-server/dist/)
npm test            # mcp-server + desktop test suites
npm run smoke       # JSON-RPC smoke test over stdio against the built server
```

The monorepo holds two workspaces: `packages/mcp-server` (the published MCP server) and `apps/desktop` (the private Electron GUI). Per-workspace dev commands live in their own `package.json` — e.g. `npm start --prefix apps/desktop` to launch the Electron app, `npm run dev --prefix packages/mcp-server` to run the server with `tsx`.

`npm test` builds `dist/` and runs `node --test` across `tests/**/*.test.mjs` — ~175 cases covering both the pure parsers (`parseDevicesOutput`, `globToRegex`, `extractInstallFailure`, `extractBuildFailureReason`, `parseDeviceState`, the UI selector, the dump-UI hierarchy parser, shell framing/pool) and the host-side logic of every UI navigation, intent-shortcut, and composite-probe tool. Each tool's test file is named after the tool (`device-state.test.mjs`, `tap-by-text.test.mjs`, etc.); `tests/fixtures/` holds captured `dumpsys` and `uiautomator` output from real devices.

`npm run smoke` drives the server end-to-end without an MCP client: `initialize` → `tools/list` → exercises every tool's error path and prints a summary line per response. Pass `--full` for full JSON-RPC dumps.

---

## License

MIT
