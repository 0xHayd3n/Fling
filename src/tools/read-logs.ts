import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAdb } from "../adb.js";
import { resolveDeviceArgs } from "../devices.js";
import { FlingError } from "../errors.js";
import { deviceIdInput } from "../schemas.js";
import { toolErrorFrom } from "../toolResult.js";

const LOGCAT_TIMEOUT_MS = 30_000;
const LOGCAT_BUFFER_BYTES = 20 * 1024 * 1024;

const PACKAGE_RE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const TAG_RE = /^[A-Za-z0-9_.+\-]+$/;

function validatePackage(name: string): void {
  if (!PACKAGE_RE.test(name)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid Android package name: "${name}".`
    );
  }
}

function validateTag(tag: string): void {
  if (!TAG_RE.test(tag)) {
    throw new FlingError(
      "INVALID_INPUT",
      `Invalid logcat tag: "${tag}". Allowed: letters, digits, underscore, dot, plus, hyphen.`
    );
  }
}

/**
 * Resolve PIDs for a package via the device shell.
 *
 * Uses `pidof` (toybox, Android 6+/API 23+). On older devices pidof is
 * absent and this returns []; callers will treat that as "app not running"
 * which can be a false negative on pre-API-23 hardware.
 */
async function resolvePids(
  deviceArgs: string[],
  packageName: string
): Promise<string[]> {
  const { stdout } = await runAdb(
    [...deviceArgs, "shell", `pidof ${packageName} 2>/dev/null || true`],
    { timeoutMs: 10_000 }
  );
  return stdout.trim().split(/\s+/).filter(Boolean);
}

export function registerReadLogs(server: McpServer): void {
  server.registerTool(
    "read_logs",
    {
      title: "Read recent device logs",
      description:
        "Dump the last N lines of `adb logcat`, optionally filtered by app package (via PID), " +
        "by logcat tag, or by minimum priority. Returns a single snapshot — does not stream.",
      inputSchema: {
        package_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Filter to logs from this app's process(es). Resolved via `pidof` on the device. " +
              "Returns an empty result with success=false if the app isn't currently running."
          ),
        tag: z
          .string()
          .min(1)
          .optional()
          .describe("Restrict to entries with this logcat tag."),
        priority: z
          .enum(["V", "D", "I", "W", "E", "F"])
          .optional()
          .describe("Minimum log priority (V=verbose, D=debug, I=info, W=warn, E=error, F=fatal). Default V."),
        lines: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .optional()
          .describe("Number of trailing lines to return. Default 200, max 5000."),
        device_id: deviceIdInput,
      },
      outputSchema: {
        device_id: z.string(),
        package_name: z.string().optional(),
        pids: z.array(z.string()).optional(),
        lines_returned: z.number().int().nonnegative(),
        logs: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ package_name, tag, priority, lines, device_id }) => {
      try {
        if (package_name) validatePackage(package_name);
        if (tag) validateTag(tag);

        const { args: deviceArgs, serial } = await resolveDeviceArgs(device_id);
        const lineCount = lines ?? 200;

        let pids: string[] | undefined;
        if (package_name) {
          pids = await resolvePids(deviceArgs, package_name);
          if (pids.length === 0) {
            const text = `${package_name} is not running on ${serial} — no logs to read.`;
            return {
              content: [{ type: "text" as const, text }],
              structuredContent: {
                device_id: serial,
                package_name,
                pids: [],
                lines_returned: 0,
                logs: "",
              },
            };
          }
        }

        // `-t N` implies a snapshot of the last N lines (it's a superset of `-d`).
        // Passing both is redundant and adb already caps output at N, so
        // truncation is not observable from this side.
        // `--pid=` accepts a comma-separated list on API 28+. On older devices
        // multi-PID filtering may be ignored; most apps run as a single process.
        const logcatArgs = ["logcat", "-t", String(lineCount), "-v", "threadtime"];
        if (pids && pids.length > 0) {
          logcatArgs.push(`--pid=${pids.join(",")}`);
        }
        if (tag) {
          logcatArgs.push(`${tag}:${priority ?? "V"}`, "*:S");
        } else if (priority) {
          logcatArgs.push(`*:${priority}`);
        }

        const { stdout } = await runAdb([...deviceArgs, ...logcatArgs], {
          timeoutMs: LOGCAT_TIMEOUT_MS,
          maxBufferBytes: LOGCAT_BUFFER_BYTES,
        });

        const trimmed = stdout.replace(/\r?\n$/, "");
        const linesReturned = trimmed.length === 0 ? 0 : trimmed.split(/\r?\n/).length;

        const header = [
          `Device: ${serial}`,
          package_name ? `Package: ${package_name} (PIDs: ${pids!.join(", ")})` : null,
          tag ? `Tag: ${tag}` : null,
          priority ? `Priority: ≥ ${priority}` : null,
          `Lines: ${linesReturned}`,
        ]
          .filter(Boolean)
          .join("  ·  ");

        const text = linesReturned > 0
          ? `${header}\n\n${trimmed}`
          : `${header}\n\n(no matching log entries)`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            device_id: serial,
            package_name,
            pids,
            lines_returned: linesReturned,
            logs: trimmed,
          },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
