import { runAdb } from "./adb.js";

export type DeviceState =
  | "device"
  | "unauthorized"
  | "offline"
  | "no permissions"
  | "recovery"
  | "sideload"
  | "bootloader"
  | "unknown";

export interface Device {
  serial: string;
  state: DeviceState;
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
  usb?: string;
  raw: string;
}

const KNOWN_STATES: readonly DeviceState[] = [
  "device",
  "unauthorized",
  "offline",
  "no permissions",
  "recovery",
  "sideload",
  "bootloader",
];

export function parseDevicesOutput(stdout: string): Device[] {
  const lines = stdout.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) =>
    l.trim().startsWith("List of devices attached")
  );
  if (headerIdx === -1) return [];

  const devices: Device[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("*")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const serial = parts[0];
    let state: DeviceState = "unknown";
    let rest: string[] = [];

    const twoWord = `${parts[1]} ${parts[2] ?? ""}`.trim();
    if (
      KNOWN_STATES.includes(twoWord as DeviceState) &&
      twoWord.includes(" ")
    ) {
      state = twoWord as DeviceState;
      rest = parts.slice(3);
    } else if (KNOWN_STATES.includes(parts[1] as DeviceState)) {
      state = parts[1] as DeviceState;
      rest = parts.slice(2);
    } else {
      state = "unknown";
      rest = parts.slice(2);
    }

    const device: Device = { serial, state, raw: trimmed };
    for (const token of rest) {
      const colonIdx = token.indexOf(":");
      if (colonIdx === -1) continue;
      const key = token.slice(0, colonIdx);
      const value = token.slice(colonIdx + 1);
      switch (key) {
        case "product":
          device.product = value;
          break;
        case "model":
          device.model = value;
          break;
        case "device":
          device.device = value;
          break;
        case "transport_id":
          device.transportId = value;
          break;
        case "usb":
          device.usb = value;
          break;
      }
    }
    devices.push(device);
  }
  return devices;
}

export async function listDevices(): Promise<Device[]> {
  const { stdout } = await runAdb(["devices", "-l"]);
  return parseDevicesOutput(stdout);
}

export function formatDevicesSummary(devices: Device[]): string {
  if (devices.length === 0) {
    return [
      "No Android devices detected.",
      "",
      "Checklist:",
      "  • Phone connected via USB (or paired over Wi-Fi).",
      "  • USB Debugging enabled (Settings → Developer options).",
      "  • RSA fingerprint prompt accepted on the phone.",
    ].join("\n");
  }

  const lines: string[] = [
    `${devices.length} device${devices.length === 1 ? "" : "s"} detected:`,
    "",
  ];

  devices.forEach((d, idx) => {
    const label = d.model ?? d.product ?? d.device ?? "unknown model";
    lines.push(`${idx + 1}. ${d.serial}  [${d.state}]  ${label}`);
    if (d.state === "unauthorized") {
      lines.push(
        "     → Accept the RSA fingerprint prompt on the phone, then re-run."
      );
    } else if (d.state === "offline") {
      lines.push(
        "     → Device is offline. Try unplugging/re-plugging or `adb kill-server`."
      );
    } else if (d.state === "no permissions") {
      lines.push(
        "     → adb lacks USB permissions. On Linux, configure udev rules; on Windows, reinstall the OEM USB driver."
      );
    } else if (d.state === "unknown") {
      lines.push(`     → Unrecognized state. Raw: ${d.raw}`);
    }
  });

  return lines.join("\n");
}
