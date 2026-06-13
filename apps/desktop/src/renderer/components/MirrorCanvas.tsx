import { useEffect, useRef } from "react";
import { useFling } from "../state/FlingContext";
import { computeLetterbox, canvasToDevice } from "../lib/coordTransform";
import { encodeTouch } from "../lib/scrcpyControl";
import styles from "./MirrorCanvas.module.css";

export function MirrorCanvas() {
  const { state } = useFling();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const lbRef = useRef({ offsetX: 0, offsetY: 0, renderedW: 0, renderedH: 0 });
  const sawKeyRef = useRef(false);

  useEffect(() => {
    if (state.mirror.status !== "running") return;
    sawKeyRef.current = false;
    const decoder = new VideoDecoder({
      output: (frame) => {
        const c = canvasRef.current;
        if (!c) { frame.close(); return; }
        const ctx = c.getContext("2d");
        if (!ctx) { frame.close(); return; }
        const lb = lbRef.current;
        ctx.fillStyle = "#0c0d10";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(frame, lb.offsetX, lb.offsetY, lb.renderedW, lb.renderedH);
        frame.close();
      },
      error: (e) => console.error("[decoder]", e),
    });
    decoder.configure({ codec: "avc1.42E01E" });
    decoderRef.current = decoder;

    const offFrame = window.fling.on.mirrorFrame((e) => {
      if (e.mirrorId !== state.mirror.mirrorId) return;
      // Detect IDR (key) frames so the decoder doesn't error on non-keyframe leadin.
      // H.264 NAL unit type lives in the low 5 bits of the first byte after start code.
      // scrcpy frames are Annex-B; first NAL is typically right after a 4-byte start code.
      let nalType = 0;
      const nal = e.nal;
      // Walk past leading zeros to find the start-code, then read the next byte for NAL type.
      let i = 0;
      while (i < nal.length && nal[i] === 0) i++;
      if (i < nal.length && nal[i] === 1) {
        if (i + 1 < nal.length) nalType = nal[i + 1]! & 0x1f;
      } else if (i < nal.length) {
        nalType = nal[i]! & 0x1f;
      }
      const isKey = nalType === 5 || nalType === 7 || nalType === 8;
      if (!sawKeyRef.current && !isKey) return;
      if (isKey) sawKeyRef.current = true;
      try {
        decoder.decode(new EncodedVideoChunk({
          type: isKey ? "key" : "delta",
          timestamp: e.pts,
          data: e.nal,
        }));
      } catch (err) {
        console.error("[decoder.decode]", err);
      }
    });

    return () => { offFrame(); decoder.close(); decoderRef.current = null; };
  }, [state.mirror.status, state.mirror.mirrorId]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      lbRef.current = computeLetterbox(c.width, c.height, state.mirror.width, state.mirror.height);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [state.mirror.width, state.mirror.height]);

  function devicePos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return canvasToDevice(
      (e.clientX - rect.left) * dpr,
      (e.clientY - rect.top) * dpr,
      lbRef.current,
      state.mirror.width,
      state.mirror.height,
    );
  }
  function send(action: "down" | "up" | "move", x: number, y: number, pointerId: number) {
    if (!state.mirror.mirrorId) return;
    const bytes = encodeTouch(action, x, y, pointerId, state.mirror.width, state.mirror.height);
    void window.fling.mirror.input({
      mirrorId: state.mirror.mirrorId,
      event: {
        kind: "touch",
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      },
    });
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      onPointerDown={(e) => {
        const p = devicePos(e);
        if (p) { (e.target as HTMLElement).setPointerCapture(e.pointerId); send("down", p.x, p.y, e.pointerId); }
      }}
      onPointerMove={(e) => {
        if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
          const p = devicePos(e);
          if (p) send("move", p.x, p.y, e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        const p = devicePos(e);
        if (p) send("up", p.x, p.y, e.pointerId);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }}
    />
  );
}
