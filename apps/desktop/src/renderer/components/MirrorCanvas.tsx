import { useEffect, useRef } from "react";
import { useFling } from "../state/FlingContext";
import { canvasToDevice, canvasToDeviceClamped } from "../lib/coordTransform";
import { encodeTouch } from "../lib/scrcpyControl";
import styles from "./MirrorCanvas.module.css";

export function MirrorCanvas() {
  const { state } = useFling();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const configNalRef = useRef<Uint8Array | null>(null);
  const sawIdrRef = useRef(false);
  const lastFrameBitmapRef = useRef<ImageBitmap | null>(null);

  useEffect(() => {
    if (state.mirror.status !== "running") return;
    configNalRef.current = state.mirror.configNal;
    sawIdrRef.current = false;

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
      // The canvas is sized to device aspect by CSS, so we draw edge-to-edge.
      ctx.fillStyle = "#0c0d10";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(source, 0, 0, c.width, c.height);
    };

    const decoder = new VideoDecoder({
      output: (frame) => {
        const c = canvasRef.current;
        if (!c) { frame.close(); return; }
        ensureBackingStore(c);
        paint(c, frame);
        createImageBitmap(frame).then((bm) => {
          if (lastFrameBitmapRef.current) lastFrameBitmapRef.current.close();
          lastFrameBitmapRef.current = bm;
          frame.close();
        }).catch(() => frame.close());
      },
      error: (e) => console.error("[decoder]", e),
    });
    // Configure for High Profile @ Level 5.1 — covers up to 4096x2304 so
    // native-resolution phone streams (e.g. 1080x2400 portrait) fit. WebCodecs
    // decoders are typically lenient about accepting lower profiles/levels
    // than configured, so this also handles older 1080p streams.
    decoder.configure({ codec: "avc1.640033", optimizeForLatency: true });
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

  // Repaint last frame when the canvas element is resized so we don't
  // see a stale stretched image until the next decode.
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
      ctx.fillStyle = "#0c0d10";
      ctx.fillRect(0, 0, c.width, c.height);
      const bm = lastFrameBitmapRef.current;
      if (bm) ctx.drawImage(bm, 0, 0, c.width, c.height);
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
    return canvasToDevice(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      state.mirror.width,
      state.mirror.height,
    );
  }
  function devicePosClamped(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return canvasToDeviceClamped(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
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
        // initial devicePos was inside the canvas; calling releasePointerCapture
        // unconditionally on a non-captured pointer throws DOMException which
        // React swallows silently.
        if (el.hasPointerCapture(e.pointerId)) {
          // Always send "up" when we were tracking the touch, even if the
          // finger released outside the canvas area. Dropping it leaves scrcpy
          // thinking the touch is still down (stuck-finger state).
          const p = devicePosClamped(e);
          if (p) send("up", p.x, p.y, e.pointerId);
          el.releasePointerCapture(e.pointerId);
        }
      }}
    />
  );
}
