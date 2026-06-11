# Fling

**An MCP server for deploying, running, and observing Android apps from any MCP client (Claude Code, Cursor, VS Code).**

> "Build my app and run it on my phone."

Fling wraps `adb` (the Android Debug Bridge) behind the [Model Context Protocol](https://modelcontextprotocol.io) so an AI assistant can drive the full build → install → launch → observe loop on a connected (or wirelessly paired) Android device. You describe the outcome; the assistant calls Fling's tools to get there.

---

## Status

**Milestone 3 — Convenience:** MCP server exposes `list_devices`, `build_app`, `install_app`, `launch_app`, `read_logs`, `deploy_and_run`. Native Gradle build system is the first-class supported toolchain. See `PLAN.md` for the full roadmap.

| Tool | Status |
|---|---|
| `list_devices` | ✅ Available |
| `build_app` | ✅ Available (Gradle) |
| `install_app` | ✅ Available |
| `launch_app` | ✅ Available |
| `read_logs` | ✅ Available |
| `deploy_and_run` | ✅ Available |
| `stop_app` | 🚧 Planned |
| `uninstall_app` | 🚧 Planned |
| `screenshot` | 🚧 Planned |

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

### 4. Install Fling

```
npm install -g @eleutex/fling
```

Or use it directly with `npx`.

### 5. Add to your MCP client

**Claude Code** (`~/.claude.json` or `.mcp.json` in a project):

```json
{
  "mcpServers": {
    "fling": {
      "command": "npx",
      "args": ["-y", "@eleutex/fling"]
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

### `deploy_and_run`

The convenience tool: build → resolve APK → resolve device → install → launch, in one call. Stops at the first failed step and reports per-step timing.

**Inputs:** all optional. `skip_build` reuses an existing APK; `apk_path`, `package_name`, `activity`, `device_id`, `reinstall`, `grant_runtime_permissions`, `cwd` all override their config / autodetect defaults.

**Output**: `success`, `device_id`, `apk_path`, `package_name`, and `steps[]` — each step records `name`, `success`, `duration_ms`, `message`.

This is what gets called when someone says *"run this on my phone."*

---

## Development

```
git clone <repo>
cd Fling
npm install
npm run build       # tsc → dist/
npm run dev         # tsx src/index.ts
npm start           # node dist/index.js
node scripts/smoke.mjs  # JSON-RPC smoke test over stdio
```

The smoke script drives the server end-to-end without an MCP client: it sends `initialize` → `tools/list` → exercises each tool's error path and prints a summary line per response. Pass `--full` to dump the full JSON-RPC responses instead.

---

## License

MIT
