# Security Policy

## Reporting a vulnerability

If you find a security issue in Fling — particularly in the MCP server (`@0xhayd3n/fling`), since it runs unsandboxed and shells out to `adb` — please report it privately rather than opening a public issue.

**Email:** contact@haydenseymour.com

Please include:

- A description of the issue and a proof-of-concept if available.
- The version of `@0xhayd3n/fling` and Node you tested against.
- Whether the issue requires a malicious project config, a malicious device, a malicious MCP client, or some other attack vector.

I'll acknowledge within 7 days, work with you on a fix and disclosure timeline, and credit you in the changelog if you'd like.

## Supported versions

Only the latest minor release is patched. Older versions may receive fixes for critical issues at the maintainer's discretion.

## Out of scope

- Vulnerabilities in `adb` itself or the Android platform — report those upstream to Google.
- Vulnerabilities in the Electron Forge / Electron dev toolchain used to build the (private) desktop app. Those don't ship to end users of the published npm package.
- Issues that require an attacker to already have local code execution on the developer's machine.
