import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, isInteresting } from "../uiDump.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const uiNodeOut = z.object({
  text: z.string(),
  content_desc: z.string(),
  resource_id: z.string(),
  class: z.string(),
  package: z.string(),
  bounds: z.object({
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  }),
  center: z.object({ x: z.number(), y: z.number() }),
  clickable: z.boolean(),
  long_clickable: z.boolean(),
  scrollable: z.boolean(),
  focusable: z.boolean(),
  focused: z.boolean(),
  enabled: z.boolean(),
  selected: z.boolean(),
  checkable: z.boolean(),
  checked: z.boolean(),
});

// Re-export for backwards-compatibility with the existing test file's import path.
export { parseUiHierarchy, isInteresting } from "../uiDump.js";
export type { UiNode, UiBounds } from "../uiDump.js";

export function registerDumpUi(server: McpServer): void {
  server.registerTool(
    "dump_ui",
    {
      title: "Dump current UI hierarchy",
      description:
        "Capture the visible Android view hierarchy via `uiautomator dump`. " +
        "Returns a flat list of elements with text, content-desc, resource-id, " +
        "bounds, and a pre-computed center {x,y} — use these to drive input_tap " +
        "by semantic targeting instead of guessing pixels from a screenshot. " +
        "Defaults to interactive_only=true, which keeps nodes that are " +
        "clickable / long-clickable / scrollable / focusable OR have any of " +
        "text / content-desc / resource-id. Pair this with input_tap, " +
        "input_swipe, or input_text for fast UI navigation.",
      inputSchema: {
        device_id: deviceIdInput,
        interactive_only: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Keep only nodes likely to matter for navigation. Set false to include layout containers and pure decorations."
          ),
        include_raw_xml: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Also return the raw uiautomator XML. Off by default because dense screens (heavy WebViews, long lists) can produce multi-MB payloads that risk breaching MCP transport size limits."
          ),
      },
      outputSchema: {
        device_id: z.string(),
        node_count: z.number().int().nonnegative(),
        nodes: z.array(uiNodeOut),
        raw_xml: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_id, interactive_only, include_raw_xml }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes: all, raw_xml } = await fetchUiDump(deviceArgs);
        const nodes = interactive_only ? all.filter(isInteresting) : all;

        const summary = interactive_only
          ? `Parsed ${all.length} node${all.length === 1 ? "" : "s"} on ${serial}; ${nodes.length} interactive.`
          : `Parsed ${nodes.length} node${nodes.length === 1 ? "" : "s"} on ${serial}.`;

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            device_id: serial,
            node_count: nodes.length,
            nodes,
            raw_xml: include_raw_xml ? raw_xml : undefined,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
