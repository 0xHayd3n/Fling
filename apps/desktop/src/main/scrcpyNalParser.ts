export interface ScrcpyFrame { pts: number; nal: Uint8Array; }

export interface NalSplitter {
  push(chunk: Uint8Array): ScrcpyFrame[];
  pending(): number;
}

export function createNalSplitter(): NalSplitter {
  let buf = new Uint8Array(0);
  const append = (chunk: Uint8Array) => {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf, 0);
    next.set(chunk, buf.length);
    buf = next;
  };

  const readBE64 = (u8: Uint8Array, offset: number): number => {
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(u8[offset + i]!);
    return Number(v);
  };
  const readBE32 = (u8: Uint8Array, offset: number): number =>
    (u8[offset]! << 24) | (u8[offset + 1]! << 16) | (u8[offset + 2]! << 8) | u8[offset + 3]!;

  return {
    push(chunk) {
      append(chunk);
      const out: ScrcpyFrame[] = [];
      let pos = 0;
      while (buf.length - pos >= 12) {
        const pts = readBE64(buf, pos);
        const size = readBE32(buf, pos + 8) >>> 0;
        if (buf.length - pos - 12 < size) break;
        const nal = buf.slice(pos + 12, pos + 12 + size);
        out.push({ pts, nal });
        pos += 12 + size;
      }
      if (pos > 0) buf = buf.slice(pos);
      return out;
    },
    pending: () => buf.length,
  };
}

export function decodeDeviceMeta(packet: Uint8Array): { deviceName: string; width: number; height: number } {
  const nameBytes = packet.subarray(0, 64);
  let nameEnd = 0;
  while (nameEnd < nameBytes.length && nameBytes[nameEnd] !== 0) nameEnd++;
  const deviceName = new TextDecoder("utf-8").decode(nameBytes.subarray(0, nameEnd));
  const width = (packet[64]! << 8) | packet[65]!;
  const height = (packet[66]! << 8) | packet[67]!;
  return { deviceName, width, height };
}
