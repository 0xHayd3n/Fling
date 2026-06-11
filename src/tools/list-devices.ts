import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatDevicesSummary, listDevices } from "../devices.js";
import { deviceShape } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

export function registerListDevices(server: McpServer): void {
  server.registerTool(
    "list_devices",
    {
      title: "List Android devices",
      description:
        "Show every Android device adb can see (USB or wireless), with its state " +
        "(device / unauthorized / offline / etc). Use this first to confirm a phone " +
        "is reachable before any other operation.",
      inputSchema: {},
      outputSchema: {
        devices: z.array(deviceShape),
        count: z.number().int().nonnegative(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const devices = await listDevices();
        return {
          content: [
            { type: "text" as const, text: formatDevicesSummary(devices) },
          ],
          structuredContent: { devices, count: devices.length },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
