import { useEffect, useRef } from "react";
import { useFling } from "../state/FlingContext";
import { computeLetterbox, canvasToDevice, canvasToDeviceClamped } from "../lib/coordTransform";
import { encodeTouch } from "../lib/scrcpyControl";
import styles from "./MirrorCanvas.module.css";

export function MirrorCanvas() {
  const { state } = useFling();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const lbRef = useRef({ offsetX: 0, offsetY: 0, renderedW: 0, renderedH: 0 });
  const configNalRef = useRef<Uint8Array | null>(null);
  const sawIdrRef = useRef(false);
  const lastFrameBitmapRef = useRef<ImageBitmap | null>(null);
  const deviceDimsRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    if (state.mirror.status !== "running") return;
    configNalRef.current = state.mirror.configNal;
    sawIdrRef.current = false;
    deviceDimsRef.current = { w: state.mirror.width, h: state.mirror.height };

    const ensureBackingStore = (c: HTMLCanvasElement): boolean => {
      const dpr = window.devicePixelRatio || 1;
      const wantW = Math.max(1, Math.floor(c.clientWidth * dpr));
      const wantH = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== wantW || c.height !== wantH) {
        c.width = wantW;
        c.height = wantH;
        return true;
      }
      return false;
    };

    const paint = (c: HTMLCanvasElement, source: CanvasImageSource) => {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const { w: devW, h: devH } = deviceDimsRef.current;
      const lb = computeLetterbox(c.width, c.height, devW || 1, devH || 1);
      lbRef.current = lb;
      ctx.fillStyle = "#0c0d10";
      ctx.fillRect(0, 0, c.width, c.height);
      if (lb.renderedW > 0 && lb.renderedH > 0) {
        ctx.drawImage(source, lb.offsetX, lb.offsetY, lb.renderedW, lb.renderedH);
      }
    };

    const decoder = new VideoDecoder({
      output: (frame) => {
        const c = canvasRef.current;
        if (!c) { frame.close(); return; }
        ensureBackingStore(c);
        // Cache an ImageBitmap of the frame so resize events can repaint without
        // waiting for the next decode. createImageBitmap is async, but we paint
        // the VideoFrame directly first for minimum latency.
        paint(c, frame);
        createImageBitmap(frame).then((bm) => {
          if (lastFrameBitmapRef.current) lastFrameBitmapRef.current.close();
          lastFrameBitmapRef.current = bm;
          frame.close();
        }).catch(() => frame.close());
      },
      error: (e) => console.error("[decoder]", e),
    });
    // Configure for High Profile @ Level 4.0 — covers any 1080p H.264 stream
    // including Baseline / Main / High since WebCodecs decoders are typically
    // lenient about accepting lower profiles than configured.
    decoder.configure({ codec: "avc1.640028", optimizeForLatency: true });
    decoderRef.current = decoder;

    // Prime the decoder with config + first IDR captured before the start
    // response. Without this we never see a key frame and all subsequent
    // delta frames are dropped.
    if (state.mirror.configNal && state.mirror.firstKeyNal) {
      const cfg = state.mirror.configNal;
      const idr = state.mirror.firstKeyNal;
      const combined = new Uint8Array(cfg.length + idr.length);
      combined.set(cfg, 0);
      combined.set(idr, cfg.length);
      try {
        decoder.decode(new EncodedVideoChunk({ type: "key", timestamp: state.mirror.firstKeyPts, data: combined }));
        sawIdrRef.current = true;
        console.log(`[mirror] primed decoder with config(${cfg.length}B) + idr(${idr.length}B) at pts=${state.mirror.firstKeyPts}`);
      } catch (err) {
        console.error("[decoder.decode] prime failed", err);
      }
    }

    let framesReceived = 0;
    let framesDecoded = 0;
    let framesDropped = 0;
    const tick = () => {
      console.log(`[mirror] received=${framesReceived} decoded=${framesDecoded} dropped=${framesDropped} sawIdr=${sawIdrRef.current} hasConfig=${!!configNalRef.current} decoderState=${decoder.state}`);
    };
    const statsTimer = setInterval(tick, 1000);

    const offFrame = window.fling.on.mirrorFrame((e) => {
      if (e.mirrorId !== state.mirror.mirrorId) return;
      framesReceived++;
      if (e.isConfig) {
        configNalRef.current = e.nal;
        return;
      }
      if (!sawIdrRef.current && !e.isKey) { framesDropped++; return; }
      let data = e.nal;
      if (e.isKey && configNalRef.current) {
        const cfg = configNalRef.current;
        const combined = new Uint8Array(cfg.length + data.length);
        combined.set(cfg, 0);
        combined.set(data, cfg.length);
        data = combined;
      }
      if (e.isKey) sawIdrRef.current = true;
      try {
        decoder.decode(new EncodedVideoChunk({
          type: e.isKey ? "key" : "delta",
          timestamp: e.pts,
          data,
        }));
        framesDecoded++;
      } catch (err) {
        console.error("[decoder.decode]", err);
      }
    });
    return () => {
      clearInterval(statsTimer);
      offFrame();
      decoder.close();
      decoderRef.current = null;
      if (lastFrameBitmapRef.current) {
        lastFrameBitmapRef.current.close();
        lastFrameBitmapRef.current = null;
      }
    };
  }, [state.mirror.status, state.mirror.mirrorId]);

  // Track device dimensions in a ref so the resize-repaint effect doesn't
  // need to be torn down when they change.
  useEffect(() => {
    deviceDimsRef.current = { w: state.mirror.width, h: state.mirror.height };
  }, [state.mirror.width, state.mirror.height]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let raf = 0;
    const repaint = () => {
      raf = 0;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const wantW = Math.max(1, Math.floor(c.clientWidth * dpr));
      const wantH = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== wantW || c.height !== wantH) {
        c.width = wantW;
        c.height = wantH;
      }
      const { w: devW, h: devH } = deviceDimsRef.current;
      const lb = computeLetterbox(c.width, c.height, devW || 1, devH || 1);
      lbRef.current = lb;
      ctx.fillStyle = "#0c0d10";
      ctx.fillRect(0, 0, c.width, c.height);
      const bm = lastFrameBitmapRef.current;
      if (bm && lb.renderedW > 0 && lb.renderedH > 0) {
        ctx.drawImage(bm, lb.offsetX, lb.offsetY, lb.renderedW, lb.renderedH);
      }
    };
    const ro = new ResizeObserver(() => {
      if (raf === 0) raf = requestAnimationFrame(repaint);
    });
    ro.observe(c);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

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
  function devicePosClamped(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return canvasToDeviceClamped(
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
        const el = e.target as HTMLElement;
        // Only release if we captured. setPointerCapture only ran when the
        // initial devicePos was inside the letterbox; calling
        // releasePointerCapture unconditionally on a non-captured pointer
        // throws DOMException which React swallows silently.
        if (el.hasPointerCapture(e.pointerId)) {
          // Always send "up" when we were tracking the touch, even if the
          // finger released outside the device area. Dropping it leaves
          // scrcpy thinking the touch is still down (stuck-finger state).
          const p = devicePosClamped(e);
          if (p) send("up", p.x, p.y, e.pointerId);
          el.releasePointerCapture(e.pointerId);
        }
      }}
    />
  );
}
