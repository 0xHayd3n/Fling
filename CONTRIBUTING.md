# Contributing to Fling

Thanks for your interest. Fling is a small, focused project — bug reports, small fixes, and tool additions that fit the existing patterns are welcome.

## Getting set up

Prerequisites: Node 22+, `adb` on PATH (Android Platform Tools), and a real Android device or emulator for end-to-end testing.

```
git clone https://github.com/0xHayd3n/Fling.git
cd Fling
npm run setup       # installs root, packages/mcp-server, apps/desktop
npm run build       # builds the MCP server
npm test            # mcp-server + desktop test suites
```

## Workflow

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). Scope when one workspace is touched, e.g. `feat(desktop):` or `fix(mcp):`.
- All new MCP tools need a dedicated test file under `packages/mcp-server/tests/`. Prefer captured device output in `tests/fixtures/` over mocks.
- All new desktop features need a dedicated test file under `apps/desktop/tests/`. The desktop runs `tsc --noEmit` as part of CI — no `any` casts or `// @ts-ignore` to silence errors.
- CI runs build + lint + both test suites on Ubuntu / Node 22 on every PR. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## What goes where

- `packages/mcp-server/` — the published MCP server (`@0xhayd3n/fling`). New tools live here. Library functions are exported via subpath exports (`@0xhayd3n/fling/devices`, `@0xhayd3n/fling/pairing`, etc.) so the desktop can import them directly.
- `apps/desktop/` — the private Electron GUI. Not published to npm.
- Public docs (this file, the README, security policy) live at the repo root.

## Filing issues

Bug reports should include:

- Fling version (`npm ls @0xhayd3n/fling`)
- Node version
- OS and OS version
- ADB version (`adb version`)
- Device model and Android version
- The exact MCP tool invocation that failed

Logs from `read_logs` or the desktop's DevTools console are very useful.

For security disclosures, see [SECURITY.md](SECURITY.md) instead.
