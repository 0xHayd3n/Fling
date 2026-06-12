import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUiDump } from "../uiDump.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import { selectTapTarget } from "./tap-by-text.js";

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

export function registerLongPressByText(server: McpServer): void {
  server.registerTool(
    "long_press_by_text",
    {
      title: "Long-press a UI element by visible text",
      description:
        "Same matching and disambiguation as tap_by_text, but holds the touch for " +
        "the specified duration (default 1000ms). Used to invoke context menus, " +
        "drag handles, and similar long-press affordances. " +
        "Designed cheap enough that the inner navigation loop can run on a " +
        "smaller/cheaper model (Haiku, Sonnet).",
      inputSchema: {
        text: z.string().min(1).describe("Visible text to match."),
        exact: z
          .boolean()
          .optional()
          .default(false)
          .describe("Require equality instead of case-sensitive substring."),
        duration_ms: z
          .number()
          .int()
          .positive()
          .max(10_000)
          .optional()
          .default(1000)
          .describe("How long to hold the touch, in milliseconds (1–9999)."),
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
        duration_ms: z.number().int().positive(),
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
    async ({ text, exact, duration_ms, device_id }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const { nodes } = await fetchUiDump(deviceArgs);
        const target = selectTapTarget(nodes, {
          by: "text",
          value: text,
          exact,
        });

        if (!target) {
          throw new FlingError(
            "UI_ELEMENT_NOT_FOUND",
            `No clickable element found for text="${text}" on ${serial}.`
          );
        }

        await runAdb(
          buildLongPressArgs(deviceArgs, target.tap_x, target.tap_y, duration_ms)
        );

        const msg = `Long-pressed "${target.matched_text}" for ${duration_ms}ms at (${target.tap_x}, ${target.tap_y}) on ${serial}.`;
        return {
          content: [{ type: "text" as const, text: msg }],
          structuredContent: {
            device_id: serial,
            matched_text: target.matched_text,
            bounds: target.bounds,
            tap_x: target.tap_x,
            tap_y: target.tap_y,
            duration_ms,
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
