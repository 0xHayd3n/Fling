# Fling

**An MCP server that lets you deploy, run, and test Android apps from any MCP client (Claude Code, Cursor, VS Code) using plain language.**

> "Build my app and run it on my phone."

---

## Status (2026-06-14)

Phase 1 is shipped and extended. The nine deploy/observe tools from the original plan are live; on top of them Fling now exposes UI navigation primitives (`tap_by_text`, `dump_ui`, …), Settings/intent shortcuts (`open_setting`, `launch_settings`), and batched composite probes (`device_state`, `screenshot_with_ui`, `launch_and_wait`). Wireless ADB pairing has shipped too (`start_pair_qr` + `wait_for_pair` MCP tools, plus a QR-scan/pin-code flow in the desktop GUI with auto-reconnect on launch). The MCP server is published as `@0xhayd3n/fling` v0.5.0; the next release lands wireless pairing as v0.6.0. Phase 2 (the Electron GUI) continues — see milestones and open questions below.

## What it is

Fling wraps `adb` (and optionally `scrcpy`) behind the Model Context Protocol so an AI assistant can drive the full build → install → launch → observe loop on a physically connected (or wirelessly paired) Android device. The user never types a command — they describe the outcome, and the assistant calls Fling's tools to make it happen.

## What problem it solves

The pieces to deploy an app to a phone (ADB, USB debugging, build tooling, log capture) already exist but are fragmented and developer-only. There is no clean, AI-native way to do it. Fling closes that gap by exposing the workflow as a small set of well-named tools any MCP client can call.

---

## Scope

### Phase 1 — Core MCP server (the priority)

A standalone npm package exposing ADB functionality as MCP tools. This is immediately useful as a personal dev tool and is the foundation for everything else. Target: a focused, well-tested server, not a kitchen sink.

### Phase 2 — GUI wrapper (optional, the product play)

An Electron app that handles device detection, guides the one-time USB-debugging setup, mirrors the phone screen via scrcpy, and gives a single chat/button interface. This is what makes Fling usable by semi-technical people. Build only if Phase 1 proves useful.

> **Reality check:** Enabling USB debugging is a manual, on-device step Android intentionally hides. Fling cannot fully eliminate it. The honest target user is *semi-technical* (a designer testing their own build, a founder, a PM) who can follow a one-time setup guide — not a truly non-technical user.

---

## Phase 1: detailed plan

### Tech stack

- **Language:** TypeScript (Node)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Transport:** stdio (for local IDE clients); add SSE later if remote use is needed
- **Child process:** Node `child_process` (execFile) to call `adb`
- **Dependency assumption:** `adb` is on the user's PATH (Android SDK Platform Tools). Fling should detect its absence and return a clear, actionable error.

### Tools to expose

| Tool | Purpose | Key inputs |
|---|---|---|
| `list_devices` | Show connected/paired devices, flag unauthorized ones | — |
| `build_app` | Run the project's build command (configurable) | build command/profile |
| `install_app` | `adb install -r <apk>` to a device | apk path, device id (optional) |
| `launch_app` | `adb shell am start` the main activity | package name, device id |
| `stop_app` | Force-stop a running app | package name, device id |
| `uninstall_app` | Remove an app | package name, device id |
| `read_logs` | Tail `adb logcat`, optionally filtered by package/tag | package/tag, line count |
| `screenshot` | Capture and return the screen as an image | device id |
| `deploy_and_run` | Convenience: build → install → launch in one call | project config |

> Naming matters: tools should read like the actions a person would describe. `deploy_and_run` is what gets called when someone says "run this on my phone."

### Device handling

- Auto-detect when exactly one device is connected.
- Require an explicit `device_id` (or honor `ANDROID_SERIAL`) when multiple devices are present.
- Detect the `unauthorized` state and return guidance: "Accept the RSA fingerprint prompt on your phone."

### Configuration

A small project-level config (e.g. `fling.config.json` or fields in `package.json`) so Fling knows:

- the build command (`./gradlew assembleDebug`, an Expo command, a custom script, etc.)
- the output APK path (or a glob to find it)
- the app's package name and main activity

Keep it optional — sensible defaults plus auto-discovery where possible (e.g. find the newest APK under `**/outputs/apk/`).

### Error handling principles

- Every failure returns a human-readable reason the AI can relay (missing adb, no device, unauthorized, build failed, apk not found).
- Long-running ops (build, logcat) need sane timeouts and buffer limits.
- Never leave a hanging logcat process.

---

## Setup the user does once

1. Install Android SDK Platform Tools (gives `adb`). Windows: `winget install Google.PlatformTools`.
2. On the phone: Settings → About Phone → tap **Build Number** 7×.
3. Settings → Developer Options → enable **USB Debugging**.
4. Plug in via USB, accept the RSA prompt.
5. Add Fling to the MCP client config.

The Phase 2 GUI exists to compress steps 1 and 5 and to surface 2–4 as a guided wizard.

---

## Naming & packaging

- **Product name:** Fling
- **npm package:** scoped `@0xhayd3n/fling`
- Do **not** put "MCP" in the product name itself — it's an implementation detail. Describe it as "Fling — an MCP server for deploying apps to Android" in the README and registry listing.

---

## Milestones

1. ✅ **Skeleton** — MCP server boots, `list_devices` works end-to-end against a real phone.
2. ✅ **Core loop** — `install_app`, `launch_app`, `read_logs` working; manual config.
3. ✅ **Convenience** — `build_app` + `deploy_and_run`; auto-discovery of APK path.
4. ✅ **Polish** — robust errors, multi-device handling, README with setup guide.
5. ✅ **Publish** — `@0xhayd3n/fling` on npm; UI-navigation, intent-shortcut, and composite-probe tools added on top of the original nine.
6. **(Phase 2)** — Electron GUI: device detection, setup wizard, scrcpy mirror, single deploy button. Not started.
7. ✅ **Wireless pairing** — QR-scan and pin-code flows, shared core in `@0xhayd3n/fling/pairing`, auto-reconnect on launch. Two MCP tools (`start_pair_qr`, `wait_for_pair`) for headless agents.

---

## Open questions

Resolved:

- ~~Which build systems to support first?~~ → Native Gradle is the first-class build system. Custom commands are supported via `config.buildCommand` as an escape hatch.
- ~~Wireless ADB (Wi-Fi pairing)?~~ → Shipped in v0.6.0. Desktop GUI generates a QR (Android scans it) with a pin-code fallback; same flow exposed as `start_pair_qr` + `wait_for_pair` MCP tools for headless agents. mDNS discovery via `adb mdns services`. Auto-reconnect on launch via `knownDevices`.

Still open:

- Does the GUI embed the MCP server, or talk to it as a separate process?
- Is the commercial angle the GUI, a hosted/team version, or does it stay open-source with the value being adoption?

---

## First task for Claude Code

> Scaffold a TypeScript MCP server named `fling-mcp` using `@modelcontextprotocol/sdk` with stdio transport. Implement `list_devices` first by shelling out to `adb devices -l` and parsing the output, including detection of the `unauthorized` state. Return clear errors if `adb` is not found on PATH.

Build that, confirm it lists your phone, then walk the milestones in order.
