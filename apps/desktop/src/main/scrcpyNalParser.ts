export interface ScrcpyFrame {
  pts: number;       // masked microsecond timestamp (top 2 flag bits stripped)
  isConfig: boolean; // bit 63: SPS/PPS codec-config packet
  isKey: boolean;    // bit 62: IDR key frame
  nal: Uint8Array;
}

const PACKET_FLAG_CONFIG = 0x8000000000000000n;
const PACKET_FLAG_KEY_FRAME = 0x4000000000000000n;
const PACKET_PTS_MASK = 0x3fffffffffffffffn;

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

  const readBE64Raw = (u8: Uint8Array, offset: number): bigint => {
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(u8[offset + i]!);
    return v;
  };
  const readBE32 = (u8: Uint8Array, offset: number): number =>
    (u8[offset]! << 24) | (u8[offset + 1]! << 16) | (u8[offset + 2]! << 8) | u8[offset + 3]!;

  return {
    push(chunk) {
      append(chunk);
      const out: ScrcpyFrame[] = [];
      let pos = 0;
      while (buf.length - pos >= 12) {
        const raw = readBE64Raw(buf, pos);
        const size = readBE32(buf, pos + 8) >>> 0;
        if (buf.length - pos - 12 < size) break;
        const isConfig = (raw & PACKET_FLAG_CONFIG) !== 0n;
        const isKey = (raw & PACKET_FLAG_KEY_FRAME) !== 0n;
        const pts = Number(raw & PACKET_PTS_MASK);
        const nal = buf.slice(pos + 12, pos + 12 + size);
        out.push({ pts, isConfig, isKey, nal });
        pos += 12 + size;
      }
      if (pos > 0) buf = buf.slice(pos);
      return out;
    },
    pending: () => buf.length,
  };
}

/**
 * Decode the 76-byte scrcpy 2.7 meta block that follows the 1-byte dummy.
 * Layout: 64 bytes device name (null-padded UTF-8), 4 bytes codec_id u32 BE
 * (ASCII like "h264"), 4 bytes video width u32 BE, 4 bytes video height u32 BE.
 */
export function decodeDeviceMeta(packet: Uint8Array): { deviceName: string; width: number; height: number } {
  const nameBytes = packet.subarray(0, 64);
  let nameEnd = 0;
  while (nameEnd < nameBytes.length && nameBytes[nameEnd] !== 0) nameEnd++;
  const deviceName = new TextDecoder("utf-8").decode(nameBytes.subarray(0, nameEnd));
  // Skip 4-byte codec_id (bytes 64..67).
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const width = view.getUint32(68, false);
  const height = view.getUint32(72, false);
  return { deviceName, width, height };
}
