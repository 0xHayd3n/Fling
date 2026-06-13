export interface ForwardEntry {
  deviceId: string;
  socket: string;
  port: number;
}

export type TeardownFn = () => Promise<void>;

interface Slot {
  entry: ForwardEntry;
  teardown: TeardownFn;
}

export class CdpForwards {
  private slots = new Map<string, Slot>();

  private key(deviceId: string, socket: string): string {
    return `${deviceId}::${socket}`;
  }

  register(entry: ForwardEntry, teardown: TeardownFn): void {
    this.slots.set(this.key(entry.deviceId, entry.socket), { entry, teardown });
  }

  async replace(entry: ForwardEntry, teardown: TeardownFn): Promise<void> {
    const key = this.key(entry.deviceId, entry.socket);
    const prior = this.slots.get(key);
    if (prior) {
      try {
        await prior.teardown();
      } catch {
        // best-effort; do not block the replacement.
      }
    }
    this.slots.set(key, { entry, teardown });
  }

  get(deviceId: string, socket: string): ForwardEntry | undefined {
    return this.slots.get(this.key(deviceId, socket))?.entry;
  }

  async teardownAll(): Promise<void> {
    const all = [...this.slots.values()];
    this.slots.clear();
    await Promise.all(
      all.map(async (slot) => {
        try {
          await slot.teardown();
        } catch {
          // swallow per-entry failure
        }
      })
    );
  }
}

export const globalCdpForwards = new CdpForwards();
