# Fling

**An MCP server for deploying, running, and observing Android apps from any MCP client (Claude Code, Cursor, VS Code).**

> "Build my app and run it on my phone."

Fling wraps `adb` (the Android Debug Bridge) behind the [Model Context Protocol](https://modelcontextprotocol.io) so an AI assistant can drive the full build → install → launch → observe loop on a connected (or wirelessly paired) Android device. You describe the outcome; the assistant calls Fling's tools to get there.

---

## Status

**Milestone 2 — Core loop:** MCP server exposes `list_devices`, `install_app`, `launch_app`, `read_logs`. See `PLAN.md` for the full roadmap.

| Tool | Status |
|---|---|
| `list_devices` | ✅ Available |
| `install_app` | ✅ Available |
| `launch_app` | ✅ Available |
| `read_logs` | ✅ Available |
| `stop_app` | 🚧 Planned |
| `uninstall_app` | 🚧 Planned |
| `screenshot` | 🚧 Planned |
| `build_app` | 🚧 Planned |
| `deploy_and_run` | 🚧 Planned |

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

### `install_app`

Push an APK to a device and install it (`adb install -r [-g]`). Reinstall by default (keeps app data).

**Inputs:** `apk_path` (required), `device_id?`, `reinstall?` (default true), `grant_runtime_permissions?` (default false).

**On failure**, returns the parsed `INSTALL_FAILED_*` code plus an actionable hint — e.g. signing-mismatch suggests `uninstall_app` first, version-downgrade suggests bumping `versionCode`.

### `launch_app`

Start an installed app. Two modes:

- **No activity given:** `adb shell monkey -p <pkg> -c LAUNCHER 1` — fires the default launcher intent.
- **Activity given:** `adb shell am start -W -n <pkg>/<activity>` — wait-mode, returns launch timing.

**Inputs:** `package_name` (required), `activity?`, `device_id?`.

Package and activity names are validated against Java identifier rules at the tool boundary.

### `read_logs`

Snapshot of `adb logcat -d` (dump-and-exit, no streaming). Returns the last N lines with optional filters.

**Inputs:** `package_name?` (resolves to PIDs via `pidof`), `tag?`, `priority?` (V/D/I/W/E/F), `lines?` (default 200, max 5000), `device_id?`.

When `package_name` is given but the app isn't running, returns `success: false` and an empty `logs` string — not an error.

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
