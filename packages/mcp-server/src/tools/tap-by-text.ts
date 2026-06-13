import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump, type UiNode } from "../uiDump.js";
import { findNodes, pickBest } from "../uiSelector.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const SCROLL_INTO_VIEW_MAX_SWIPES = 5;

export function buildTapArgs(
  deviceArgs: string[],
  x: number,
  y: number
): string[] {
  return [...deviceArgs, "shell", "input", "tap", String(x), String(y)];
}

/**
 * Build the adb argv for a long-press at (x, y) held for `durationMs`. A
 * long-press is a zero-length swipe — start and end coordinates are
 * identical; only the duration matters.
 */
export function buildLongPressArgs(
  deviceArgs: string[],
  x: number,
  y: number,
  durationMs: number
): string[] {
  return [
    ...deviceArgs,
    "shell",
    "input",
    "swipe",
    String(x),
    String(y),
    String(x),
    String(y),
    String(durationMs),
  ];
}

export interface TapTarget {
  tap_x: number;
  tap_y: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  matched_text: string;
  fell_back_to_match: boolean;
  candidates_count: number;
}

export function selectTapTarget(
  nodes: UiNode[],
  selector: { by: "text"; value: string; exact?: boolean }
): TapTarget | null {
  const matches = findNodes(nodes, selector);
  if (matches.length === 0) return null;
  const best = pickBest(matches, nodes);
  if (!best) return null;
  return {
    tap_x: best.node.center.x,
    tap_y: best.node.center.y,
    bounds: best.node.bounds,
    matched_text: matches[0].text,
    fell_back_to_match: best.fellBackToMatch,
    candidates_count: matches.length,
  };
}

async function swipeDownFullScreen(deviceArgs: string[]): Promise<void> {
  // Coordinates picked to be safe on a wide range of phone resolutions.
  // 500ms slow-drag avoids being recognized as a fling that overshoots.
  await runAdb([
    ...deviceArgs,
    "shell",
    "input",
    "swipe",
    "500",
    "1500",
    "500",
    "500",
    "500",
  ]);
}

export function registerTapByText(server: McpServer): void {
  server.registerTool(
    "tap_by_text",
    {
      title: "Tap (or long-press) a UI element by visible text",
      description:
        "Dump UI, find the first node whose text matches, and tap the smallest " +
        "clickable container whose bounds contain it — folding dump + filter + " +
        "input dispatch into one call. " +
        "Substring matching is case-sensitive by default; pass exact:true for " +
        "strict equality. With scroll_into_view:true, performs up to 5 down-swipes " +
        "if the element is not currently visible. " +
        "Pass hold_ms to long-press for the given duration instead of tapping — " +
        "useful for context menus and drag handles. " +
        "For icon buttons with no text, use tap_by_content_desc. For non-localized " +
        "or robust targeting, prefer tap_by_resource_id.",
      inputSchema: {
        text: z.string().min(1).describe("Visible text to match."),
        exact: z
          .boolean()
          .optional()
          .default(false)
          .describe("Require equality instead of case-sensitive substring."),
        scroll_into_view: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If the element is not visible, swipe down up to 5 times searching for it."
          ),
        hold_ms: z
          .number()
          .int()
          .positive()
          .max(10_000)
          .optional()
          .describe(
            "If set, long-press for this many milliseconds instead of tapping. Range 1–10000."
          ),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        matched_text: z.string(),
        bounds: z.object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        }),
        tap_x: z.number(),
        tap_y: z.number(),
        scrolled_into_view: z.boolean(),
        candidates_count: z.number().int().nonnegative(),
        fell_back_to_match: z.boolean(),
        hold_ms: z.number().int().positive().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ text, exact, scroll_into_view, hold_ms, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        let target: TapTarget | null = null;
        let scrolled = false;

        const { nodes } = await fetchUiDump(deviceArgs);
        target = selectTapTarget(nodes, { by: "text", value: text, exact });

        if (!target && scroll_into_view) {
          for (let i = 0; i < SCROLL_INTO_VIEW_MAX_SWIPES; i++) {
            await swipeDownFullScreen(deviceArgs);
            scrolled = true;
            const { nodes: nextNodes } = await fetchUiDump(deviceArgs);
            target = selectTapTarget(nextNodes, {
              by: "text",
              value: text,
              exact,
            });
            if (target) break;
          }
        }

        if (!target) {
          throw new FlingError(
            "UI_ELEMENT_NOT_FOUND",
            `No clickable element found for text="${text}" on ${serial}${scroll_into_view ? " (after scrolling)" : ""}.`
          );
        }

        if (hold_ms) {
          await runAdb(
            buildLongPressArgs(deviceArgs, target.tap_x, target.tap_y, hold_ms)
          );
        } else {
          await runAdb(buildTapArgs(deviceArgs, target.tap_x, target.tap_y));
        }

        const verb = hold_ms ? `Long-pressed (${hold_ms}ms)` : "Tapped";
        const msg = `${verb} "${target.matched_text}" at (${target.tap_x}, ${target.tap_y}) on ${serial}${target.candidates_count > 1 ? ` [${target.candidates_count} candidates; took first]` : ""}.`;

        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            matched_text: target.matched_text,
            bounds: target.bounds,
            tap_x: target.tap_x,
            tap_y: target.tap_y,
            scrolled_into_view: scrolled,
            candidates_count: target.candidates_count,
            fell_back_to_match: target.fell_back_to_match,
            hold_ms,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
