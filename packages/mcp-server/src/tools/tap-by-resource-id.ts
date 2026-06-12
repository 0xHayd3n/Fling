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

export interface ResourceIdTapTarget {
  tap_x: number;
  tap_y: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  matched_resource_id: string;
  fell_back_to_match: boolean;
  candidates_count: number;
}

export function selectTapByResourceId(
  nodes: UiNode[],
  resourceId: string
): ResourceIdTapTarget | null {
  const matches = findNodes(nodes, { by: "resource_id", value: resourceId });
  if (matches.length === 0) return null;
  const best = pickBest(matches, nodes);
  if (!best) return null;
  return {
    tap_x: best.node.center.x,
    tap_y: best.node.center.y,
    bounds: best.node.bounds,
    matched_resource_id: matches[0].resource_id,
    fell_back_to_match: best.fellBackToMatch,
    candidates_count: matches.length,
  };
}

export function registerTapByResourceId(server: McpServer): void {
  server.registerTool(
    "tap_by_resource_id",
    {
      title: "Tap a UI element by its Android resource ID",
      description:
        "Dump UI, find the node with the exact resource_id, and tap the smallest " +
        "clickable container whose bounds contain it. Resource IDs are unique by " +
        "construction — typically 0 or 1 match. Most robust selector when you " +
        "know the id (survives localization changes). No scroll_into_view; " +
        "compose with scroll_until_visible if the element is off-screen. " +
        "Designed cheap enough that the inner navigation loop can run on a " +
        "smaller/cheaper model (Haiku, Sonnet).",
      inputSchema: {
        resource_id: z
          .string()
          .min(1)
          .describe(
            "Full Android resource ID (e.g. com.google.android.apps.photos:id/searchbar)."
          ),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        matched_resource_id: z.string(),
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
    async ({ resource_id, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes } = await fetchUiDump(deviceArgs);
        const target = selectTapByResourceId(nodes, resource_id);

        if (!target) {
          throw new FlingError(
            "UI_ELEMENT_NOT_FOUND",
            `No clickable element found for resource_id="${resource_id}" on ${serial}.`
          );
        }

        await runAdb(buildTapArgs(deviceArgs, target.tap_x, target.tap_y));

        const msg = `Tapped resource_id="${target.matched_resource_id}" at (${target.tap_x}, ${target.tap_y}) on ${serial}.`;
        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            matched_resource_id: target.matched_resource_id,
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
