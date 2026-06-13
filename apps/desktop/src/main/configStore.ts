import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { FlingConfig } from "./ipc/channels";

const KNOWN_DEVICES_TTL_DAYS = 30;

let cached: FlingConfig | null = null;

function defaults(): FlingConfig {
  return {
    version: 1,
    window: { x: 100, y: 100, width: 720, height: 540 },
    recentProjects: [],
    wireless: { lastHost: null, lastPort: null },
    mirror: {
      maxResolution: 1080,
      bitrateBps: 4_000_000,
      autoMirrorOnLaunch: false,
      defaultDeviceSerial: null,
    },
    knownDevices: [],
  };
}

function configPath(): string {
  return join(app.getPath("userData"), "fling-config.json");
}

export async function readConfig(): Promise<FlingConfig> {
  if (cached) return cached;
  try {
    const txt = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(txt) as Partial<FlingConfig>;
    cached = { ...defaults(), ...parsed };
    return cached;
  } catch {
    cached = defaults();
    return cached;
  }
}

export async function writeConfig(patch: Partial<FlingConfig>): Promise<void> {
  const current = await readConfig();
  cached = { ...current, ...patch };
  const tmp = `${configPath()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cached, null, 2), "utf8");
  await fs.rename(tmp, configPath());
}

export async function rememberPairedDevice(serial: string, model: string, host: string, port: number): Promise<void> {
  const cfg = await readConfig();
  const now = Date.now();
  const cutoff = now - KNOWN_DEVICES_TTL_DAYS * 24 * 60 * 60 * 1000;
  const others = cfg.knownDevices.filter((d) => d.serial !== serial && d.lastSeen >= cutoff);
  const known = [...others, { serial, model, lastSeen: now }];
  await writeConfig({ knownDevices: known, wireless: { lastHost: host, lastPort: port } });
}
