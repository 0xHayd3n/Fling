import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { findNodes, pickBest } from "../uiSelector.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { buildTapArgs } from "./tap-by-text.js";

export interface ContentDescTapTarget {
  tap_x: number;
  tap_y: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  matched_content_desc: string;
  fell_back_to_match: boolean;
  candidates_count: number;
}

export function selectTapByContentDesc(
  nodes: UiNode[],
  contentDesc: string,
  exact: boolean
): ContentDescTapTarget | null {
  const matches = findNodes(nodes, {
    by: "content_desc",
    value: contentDesc,
    exact,
  });
  if (matches.length === 0) return null;
  const best = pickBest(matches, nodes);
  if (!best) return null;
  return {
    tap_x: best.node.center.x,
    tap_y: best.node.center.y,
    bounds: best.node.bounds,
    matched_content_desc: matches[0].content_desc,
    fell_back_to_match: best.fellBackToMatch,
    candidates_count: matches.length,
  };
}

export function registerTapByContentDesc(server: McpServer): void {
  server.registerTool(
    "tap_by_content_desc",
    {
      title: "Tap a UI element by accessibility label (content-desc)",
      description:
        "Dump UI, find the first node whose content-desc matches, and tap the " +
        "smallest clickable container whose bounds contain it. Substring matching " +
        "is case-sensitive by default; pass exact:true for strict equality. " +
        "Used for icon buttons with no visible text (Search, Back, Account). " +
        "Designed cheap enough that the inner navigation loop can run on a " +
        "smaller/cheaper model (Haiku, Sonnet).",
      inputSchema: {
        content_desc: z
          .string()
          .min(1)
          .describe("Accessibility label to match."),
        exact: z
          .boolean()
          .optional()
          .default(false)
          .describe("Require equality instead of case-sensitive substring."),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        matched_content_desc: z.string(),
        bounds: z.object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        }),
        tap_x: z.number(),
        tap_y: z.number(),
        candidates_count: z.number().int().nonnegative(),
        fell_back_to_match: z.boolean(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content_desc, exact, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes } = await fetchUiDump(deviceArgs);
        const target = selectTapByContentDesc(nodes, content_desc, exact);

        if (!target) {
          throw new FlingError(
            "UI_ELEMENT_NOT_FOUND",
            `No clickable element found for content_desc="${content_desc}" on ${serial}.`
          );
        }

        await runAdb(buildTapArgs(deviceArgs, target.tap_x, target.tap_y));

        const msg = `Tapped content_desc="${target.matched_content_desc}" at (${target.tap_x}, ${target.tap_y}) on ${serial}.`;
        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            matched_content_desc: target.matched_content_desc,
            bounds: target.bounds,
            tap_x: target.tap_x,
            tap_y: target.tap_y,
            candidates_count: target.candidates_count,
            fell_back_to_match: target.fell_back_to_match,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
