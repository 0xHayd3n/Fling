import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchScreenshotPng } from "./screenshot.js";
import { fetchUiDump } from "../uiDump.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import type { UiNode } from "../uiDump.js";

export interface ScreenshotWithUiInput {
  screenshotFn: () => Promise<Buffer>;
  dumpFn: () => Promise<UiNode[]>;
}

export interface ScreenshotWithUiResult {
  bytes: number;
  nodes: UiNode[];
  node_count: number;
  png_base64: string;
}

/**
 * Capture the screen PNG and the parsed UI hierarchy from the same moment,
 * in parallel. Halves the round-trips when a caller needs both visual and
 * semantic data. The two captures are issued concurrently but aren't truly
 * atomic — they may be a few ms apart, which is much tighter than two
 * separate MCP calls would produce.
 */
export async function captureScreenshotWithUi(
  input: ScreenshotWithUiInput
): Promise<ScreenshotWithUiResult> {
  const [png, nodes] = await Promise.all([input.screenshotFn(), input.dumpFn()]);
  return {
    bytes: png.length,
    nodes,
    node_count: nodes.length,
    png_base64: png.toString("base64"),
  };
}

export function registerScreenshotWithUi(server: McpServer): void {
  server.registerTool(
    "screenshot_with_ui",
    {
      title: "Capture screenshot and UI hierarchy together",
      description:
        "Returns the PNG and the parsed interactive UI nodes from the " +
        "same moment, in a single MCP call. Prefer over separate " +
        "screenshot + dump_ui when you need both visual and semantic data.",
      inputSchema: {
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        bytes: z.number().int().nonnegative(),
        node_count: z.number().int().nonnegative(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const result = await captureScreenshotWithUi({
          screenshotFn: () => fetchScreenshotPng(deviceArgs),
          dumpFn: async () => (await fetchUiDump(deviceArgs)).nodes,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Captured ${result.bytes.toLocaleString()} bytes and ${result.node_count} UI node(s) from ${serial}.`,
            },
            {
              type: "image" as const,
              data: result.png_base64,
              mimeType: "image/png",
            },
          ],
          structuredContent: {
            device_id: serial,
            bytes: result.bytes,
            node_count: result.node_count,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
