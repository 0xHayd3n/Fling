# Fling

**An MCP server for deploying, running, and observing Android apps from any MCP client (Claude Code, Cursor, VS Code).**

> "Build my app and run it on my phone."

Fling wraps `adb` (the Android Debug Bridge) behind the [Model Context Protocol](https://modelcontextprotocol.io) so an AI assistant can drive the full build → install → launch → observe loop on a connected (or wirelessly paired) Android device. You describe the outcome; the assistant calls Fling's tools to get there.

---

## Status

**Milestone 1 — Skeleton:** MCP server boots over stdio and exposes `list_devices`. See `PLAN.md` for the full roadmap.

| Tool | Status |
|---|---|
| `list_devices` | ✅ Available |
| `install_app` | 🚧 Planned |
| `launch_app` | 🚧 Planned |
| `stop_app` | 🚧 Planned |
| `uninstall_app` | 🚧 Planned |
| `read_logs` | 🚧 Planned |
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

The smoke script drives the server end-to-end without an MCP client: it sends `initialize` → `tools/list` → `tools/call list_devices` and prints every response.

---

## License

MIT
