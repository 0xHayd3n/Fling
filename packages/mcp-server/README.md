# @0xhayd3n/fling

**An MCP server for deploying, running, and observing Android apps from any MCP client (Claude Code, Cursor, VS Code).**

Fling wraps `adb` (the Android Debug Bridge) behind the [Model Context Protocol](https://modelcontextprotocol.io) so an AI assistant can drive the full build → install → launch → observe loop on a connected (or wirelessly paired) Android device.

See the full README, setup guide, and tool reference at **https://github.com/0xHayd3n/Fling**.

## Install

```
npm install -g @0xhayd3n/fling
```

Or invoke directly with `npx`.

## Add to your MCP client

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

## Prerequisites

- Node 18+
- `adb` on PATH (Android Platform Tools)
- A connected (USB-authorized or wirelessly paired) Android device

See [Setup (one-time)](https://github.com/0xHayd3n/Fling#setup-one-time) on GitHub for the full walkthrough.

## License

MIT — see [LICENSE](LICENSE).
