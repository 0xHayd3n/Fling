#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AdbError } from "./adb.js";
import { formatDevicesSummary, listDevices } from "./devices.js";

const SERVER_NAME = "fling";
const SERVER_VERSION = "0.1.0";

function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function describeAdbError(err: unknown): string {
  if (err instanceof AdbError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function main() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_devices",
    {
      title: "List Android devices",
      description:
        "Show every Android device adb can see (USB or wireless), with its state " +
        "(device / unauthorized / offline / etc). Use this first to confirm a phone " +
        "is reachable before any other operation.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const devices = await listDevices();
        const text = formatDevicesSummary(devices);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { devices, count: devices.length },
        };
      } catch (err) {
        return toolError(describeAdbError(err));
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[fling] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});
