import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomBytes } from "node:crypto";
import { buildQrText } from "../qrText.js";
import { toolErrorFrom } from "../toolResult.js";

interface PendingSession {
  password: string;
  expiresAt: number;
}

const pending = new Map<string, PendingSession>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expiresAt <= now) pending.delete(k);
  }
}

export function consumeSession(serviceName: string): PendingSession | undefined {
  pruneExpired();
  const s = pending.get(serviceName);
  if (!s) return undefined;
  pending.delete(serviceName);
  return s;
}

export function __pendingForTest(): Map<string, PendingSession> {
  pruneExpired();
  return pending;
}

export function clearPending(): void {
  pending.clear();
}

export function registerSessionForTest(serviceName: string, password: string, expiresAt: number): void {
  pending.set(serviceName, { password, expiresAt });
}

const DEFAULT_EXPIRES_IN_MS = 60_000;

export function registerStartPairQr(server: McpServer): void {
  server.registerTool(
    "start_pair_qr",
    {
      title: "Generate a wireless-ADB pairing QR",
      description:
        "Generate a QR-code payload (WIFI:T:ADB;S:<name>;P:<password>;;) for Android's " +
        "Wireless debugging → Pair device with QR code flow. Returns the QR text plus the " +
        "service_name to pass to wait_for_pair. The QR expires in 60 seconds.",
      inputSchema: {},
      outputSchema: {
        qr_text: z.string(),
        service_name: z.string(),
        expires_at_ms: z.number().int(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const serviceName = `fling-debug-${randomBytes(2).toString("hex")}`;
        const password = randomBytes(12).toString("base64").replace(/[=+/]/g, "");
        const expiresAt = Date.now() + DEFAULT_EXPIRES_IN_MS;
        const qrText = buildQrText({ serviceName, password });
        pending.set(serviceName, { password, expiresAt });
        return {
          content: [{ type: "text" as const, text: `QR payload: ${qrText}\nService name: ${serviceName}\nExpires in ~60s.` }],
          structuredContent: { qr_text: qrText, service_name: serviceName, expires_at_ms: expiresAt },
        };
      } catch (err) {
        return toolErrorFrom(err);
      }
    }
  );
}
