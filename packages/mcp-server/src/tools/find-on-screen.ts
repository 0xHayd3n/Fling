import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { findNodes, type Selector } from "../uiSelector.js";
import { resolveDeviceArgs } from "../devices.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const MAX_MATCHES = 20;

export interface FindOnScreenMatch {
  text: string;
  content_desc: string;
  resource_id: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  center: { x: number; y: number };
  clickable: boolean;
}

export interface FindOnScreenResult {
  found: boolean;
  count: number;
  matches: FindOnScreenMatch[];
  truncated: boolean;
}

export function buildFindOnScreenResult(
  nodes: UiNode[],
  selector: Selector
): FindOnScreenResult {
  const matched = findNodes(nodes, selector);
  const matches = matched.slice(0, MAX_MATCHES).map((n) => ({
    text: n.text,
    content_desc: n.content_desc,
    resource_id: n.resource_id,
    bounds: n.bounds,
    center: n.center,
    clickable: n.clickable,
  }));
  return {
    found: matched.length > 0,
    count: matched.length,
    matches,
    truncated: matched.length > MAX_MATCHES,
  };
}

export function registerFindOnScreen(server: McpServer): void {
  server.registerTool(
    "find_on_screen",
    {
      title: "Find UI elements on the current screen (no action)",
      description:
        "Pure query — no action taken. Returns up to 20 matches for the given selector. " +
        "Use to assert state, disambiguate between multiple matches, or check whether " +
        "something is visible before deciding what to do. " +
        "Designed cheap enough that the inner navigation loop can run on a smaller/cheaper " +
        "model (Haiku, Sonnet). Model selection is your IDE's choice — Fling makes no demands.",
      inputSchema: {
        by: z
          .enum(["text", "resource_id", "content_desc"])
          .describe("Which attribute to match on."),
        value: z.string().min(1).describe("Value to look up."),
        exact: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "When true, requires equality (ignored for resource_id which is always exact)."
          ),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        found: z.boolean(),
        count: z.number().int().nonnegative(),
        matches: z.array(
          z.object({
            text: z.string(),
            content_desc: z.string(),
            resource_id: z.string(),
            bounds: z.object({
              x1: z.number(),
              y1: z.number(),
              x2: z.number(),
              y2: z.number(),
            }),
            center: z.object({ x: z.number(), y: z.number() }),
            clickable: z.boolean(),
          })
        ),
        truncated: z.boolean(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ by, value, exact, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes } = await fetchUiDump(deviceArgs);
        const selector: Selector =
          by === "resource_id"
            ? { by, value }
            : { by, value, exact };
        const result = buildFindOnScreenResult(nodes, selector);

        const summary = result.found
          ? `Found ${result.count} match${result.count === 1 ? "" : "es"} for ${by}="${value}" on ${serial}${result.truncated ? ` (showing first ${MAX_MATCHES})` : ""}.`
          : `No matches for ${by}="${value}" on ${serial}.`;

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            device_id: serial,
            ...result,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
