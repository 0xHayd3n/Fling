import { writeFile } from "node:fs/promises";
import { resolve as resolvePath, sep } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdbBinary } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const SCREENSHOT_TIMEOUT_MS = 30_000;
const SCREENSHOT_MAX_BYTES = 30 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function looksLikePng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/**
 * Capture the device screen as a PNG buffer via `adb exec-out screencap -p`.
 * Validates the result starts with a PNG signature. Used by both the
 * standalone screenshot tool and the screenshot_with_ui composite.
 */
export async function fetchScreenshotPng(deviceArgs: string[]): Promise<Buffer> {
  const { stdout } = await runAdbBinary(
    [...deviceArgs, "exec-out", "screencap", "-p"],
    { timeoutMs: SCREENSHOT_TIMEOUT_MS, maxBufferBytes: SCREENSHOT_MAX_BYTES }
  );
  if (!looksLikePng(stdout)) {
    throw new FlingError(
      "ADB_FAILED",
      "screencap output did not start with a PNG signature. " +
        "This usually means the device returned an error or the binary stream was corrupted."
    );
  }
  return stdout;
}

export function registerScreenshot(server: McpServer): void {
  server.registerTool(
    "screenshot",
    {
      title: "Capture a screenshot",
      description:
        "Grab the device's current screen as a PNG via `adb exec-out screencap -p`. " +
        "Returns the image inline as MCP image content. Pass `save_to` to also write " +
        "the PNG to disk on the host. When you also need parsed UI nodes from the same " +
        "moment, prefer `screenshot_with_ui` (halves the round-trips).",
      inputSchema: {
        device_id: deviceIdInput,
        save_to: z
          .string()
          .min(1)
          .optional()
          .describe("Optional host path to also save the PNG (relative to MCP server cwd)."),
      },
      outputSchema: {
        device_id: z.string(),
        bytes: z.number().int().positive(),
        saved_to: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ device_id, save_to }) => {
      try {
        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);

        const stdout = await fetchScreenshotPng(deviceArgs);

        let savedTo: string | undefined;
        if (save_to) {
          // Constrain save_to to the server's cwd to prevent path-traversal
          // primitives. A malicious or compromised assistant could otherwise
          // pass `../../.ssh/authorized_keys` and overwrite arbitrary files.
          // Users who genuinely want to write elsewhere can run the MCP server
          // from that directory.
          const cwd = process.cwd();
          const resolved = resolvePath(cwd, save_to);
          const cwdWithSep = cwd.endsWith(sep) ? cwd : cwd + sep;
          if (resolved !== cwd && !resolved.startsWith(cwdWithSep)) {
            throw new FlingError(
              "INVALID_INPUT",
              `save_to "${save_to}" resolves to ${resolved}, which is outside the server's cwd (${cwd}).`
            );
          }
          savedTo = resolved;
          await writeFile(savedTo, stdout);
        }

        const base64 = stdout.toString("base64");
        const summaryLines = [
          `Captured ${stdout.length.toLocaleString()} bytes from ${serial}.`,
        ];
        if (savedTo) summaryLines.push(`Saved to ${savedTo}.`);

        return {
          content: [
            { type: "text" as const, text: summaryLines.join("\n") },
            { type: "image" as const, data: base64, mimeType: "image/png" },
          ],
          structuredContent: {
            device_id: serial,
            bytes: stdout.length,
            saved_to: savedTo,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
