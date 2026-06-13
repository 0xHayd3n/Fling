import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { fetchUiDump } from "../uiDump.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";
import type { UiNode } from "../uiDump.js";

export interface TapAndVerifyInput {
  text: string;
  expect?: string;
  gone?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  dumpFn: () => Promise<UiNode[]>;
  tapFn: (x: number, y: number) => Promise<void>;
  sleepFn: (ms: number) => Promise<void>;
  nowFn: () => number;
}

export interface TapAndVerifyResult {
  tapped: boolean;
  verified: boolean;
  before_node: { text: string; center: { x: number; y: number } };
}

/**
 * Atomic semantic tap: find a node by text, tap its center, optionally
 * re-dump and verify a follow-up condition. Saves the Claude round-trip
 * that would otherwise be dump → reason → tap → re-dump → check.
 *
 * Verify modes:
 *   - expect: a string that should APPEAR in the post-tap dump
 *   - gone:   a string that should be ABSENT from the post-tap dump
 * If both are provided, verified=true if EITHER condition holds (OR).
 * If neither is provided, verified=true immediately after the tap.
 */
export async function tapAndVerify(
  input: TapAndVerifyInput
): Promise<TapAndVerifyResult> {
  const timeoutMs = input.timeoutMs ?? 5000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;

  const initial = await input.dumpFn();
  const target = initial.find((n) => n.text.includes(input.text));
  if (!target) {
    throw new FlingError(
      "UI_ELEMENT_NOT_FOUND",
      `No node matches text="${input.text}".`
    );
  }
  await input.tapFn(target.center.x, target.center.y);

  const before_node = { text: target.text, center: target.center };

  if (!input.expect && !input.gone) {
    return { tapped: true, verified: true, before_node };
  }

  const start = input.nowFn();
  while (input.nowFn() - start < timeoutMs) {
    await input.sleepFn(pollIntervalMs);
    const dump = await input.dumpFn();
    if (input.expect && dump.some((n) => n.text.includes(input.expect!))) {
      return { tapped: true, verified: true, before_node };
    }
    if (input.gone && !dump.some((n) => n.text.includes(input.gone!))) {
      return { tapped: true, verified: true, before_node };
    }
  }
  return { tapped: true, verified: false, before_node };
}

export function registerTapTextVerified(server: McpServer): void {
  server.registerTool(
    "tap_text_verified",
    {
      title: "Atomically tap a text node and verify the result",
      description:
        "One-shot: dump UI, find a node containing `text`, tap its center, " +
        "then optionally re-dump and verify `expect` appears (or `gone` is " +
        "absent). Saves the dump-reason-tap-verify round-trips. Prefer over " +
        "separate dump_ui + tap_by_text when the goal includes verification.",
      inputSchema: {
        device_id: deviceIdInput,
        text: z.string().min(1),
        expect: z.string().optional(),
        gone: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
      },
      outputSchema: {
        device_id: z.string(),
        tapped: z.boolean(),
        verified: z.boolean(),
        before_node: z.object({
          text: z.string(),
          center: z.object({ x: z.number(), y: z.number() }),
        }),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_id, text, expect, gone, timeout_ms }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const result = await tapAndVerify({
          text,
          expect,
          gone,
          timeoutMs: timeout_ms,
          dumpFn: async () => (await fetchUiDump(deviceArgs)).nodes,
          tapFn: async (x, y) => {
            await runAdb([
              ...deviceArgs,
              "shell",
              "input",
              "tap",
              String(x),
              String(y),
            ]);
          },
          sleepFn: (ms) => new Promise((r) => setTimeout(r, ms)),
          nowFn: () => Date.now(),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Tapped "${result.before_node.text}" on ${serial} — verified=${result.verified}`,
            },
          ],
          structuredContent: { device_id: serial, ...result },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
