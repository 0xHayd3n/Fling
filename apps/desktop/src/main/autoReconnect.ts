import type { BrowserWindow } from "electron";
import { discoverConnectByHost } from "@eleutex/fling/pairing";
import { runAdb } from "@eleutex/fling/adb";
import { readConfig } from "./configStore";
import { Channels } from "./ipc/channels";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PER_DEVICE_TIMEOUT_MS = 4_000;

export async function attemptReconnect(getWindow: () => BrowserWindow | null): Promise<void> {
  const cfg = await readConfig();
  const now = Date.now();
  const candidates = cfg.knownDevices.filter((d) => now - d.lastSeen <= TTL_MS);
  if (candidates.length === 0) return;

  await Promise.all(
    candidates.map(async (d) => {
      try {
        // knownDevices.serial is stored as "host:port" for wireless devices.
        // The connect port may have changed since last seen (phone reboot),
        // so re-discover via mDNS on the same host.
        const host = d.serial.includes(":") ? (d.serial.split(":")[0] ?? d.serial) : d.serial;
        const found = await discoverConnectByHost(host, PER_DEVICE_TIMEOUT_MS);
        await runAdb(["connect", `${found.host}:${found.port}`]);
        getWindow()?.webContents.send(Channels.pairingStatus, {
          status: { kind: "success", serial: `${found.host}:${found.port}`, model: d.model },
        });
      } catch {
        // Silent — phone off, out of range, or different network.
      }
    })
  );
}
