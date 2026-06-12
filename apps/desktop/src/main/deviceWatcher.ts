import { EventEmitter } from "node:events";
import { listDevices, type Device } from "@eleutex/fling/devices";

export interface DeviceWatcher extends EventEmitter {
  start(): void;
  stop(): void;
  snapshot(): Device[];
}

export function devicesEqual(a: Device[], b: Device[]): boolean {
  if (a.length !== b.length) return false;
  const key = (d: Device) => `${d.serial}|${d.state}|${d.model ?? ""}`;
  const aKeys = a.map(key).sort();
  const bKeys = b.map(key).sort();
  return aKeys.every((k, i) => k === bKeys[i]);
}

export function createDeviceWatcher(opts: {
  pollMs?: number;
  listFn?: () => Promise<Device[]>;
} = {}): DeviceWatcher {
  const pollMs = opts.pollMs ?? 1500;
  const listFn = opts.listFn ?? listDevices;
  const emitter = new EventEmitter() as DeviceWatcher;
  let last: Device[] = [];
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const poll = async () => {
    if (!running) return;
    try {
      const next = await listFn();
      if (!devicesEqual(last, next)) {
        last = next;
        emitter.emit("changed", next);
      }
    } catch (err) {
      emitter.emit("error", err);
    } finally {
      if (running) timer = setTimeout(poll, pollMs);
    }
  };

  emitter.start = () => {
    if (running) return;
    running = true;
    void poll();
  };
  emitter.stop = () => {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  emitter.snapshot = () => last;
  return emitter;
}
