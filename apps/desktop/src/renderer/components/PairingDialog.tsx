import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useFling } from "../state/FlingContext";
import type { PairingStatus } from "../../main/ipc/channels";
import styles from "./PairingDialog.module.css";

type Mode = "qr" | "code";

export function PairingDialog() {
  const { state, dispatch } = useFling();
  const [mode, setMode] = useState<Mode>("qr");
  const [status, setStatus] = useState<PairingStatus | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [code, setCode] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hintTimerRef = useRef<number | null>(null);

  const open = state.modals.pairing;

  // Subscribe to pairing.status events while open.
  useEffect(() => {
    if (!open) return;
    const off = window.fling.on.pairingStatus((evt) => {
      setStatus(evt.status);
      if (evt.status.kind === "success") {
        const model = evt.status.model;
        window.setTimeout(() => {
          dispatch({ type: "MODAL_CLOSE", modal: "pairing" });
          dispatch({
            type: "TOAST_ADD",
            toast: {
              id: `pair-${Date.now()}`,
              kind: "success",
              message: `Phone paired and connected · ${model}`,
              auto: 4000,
            },
          });
        }, 1000);
      }
    });
    return off;
  }, [open, dispatch]);

  // Kick off QR pairing whenever the dialog opens in QR mode.
  useEffect(() => {
    if (!open || mode !== "qr") return;
    setStatus(null);
    setQrText(null);
    setShowHint(false);
    let cancelled = false;
    void window.fling.pairing.startQr().then((r) => {
      if (cancelled) return;
      setQrText(r.qrText);
    });
    // 30s no-progress hint.
    hintTimerRef.current = window.setTimeout(() => setShowHint(true), 30_000);
    return () => {
      cancelled = true;
      if (hintTimerRef.current != null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      void window.fling.pairing.cancel();
    };
  }, [open, mode]);

  // Draw the QR onto the canvas when qrText changes.
  useEffect(() => {
    if (!qrText || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, qrText, { width: 180, margin: 1 });
  }, [qrText]);

  if (!open) return null;

  const close = () => {
    void window.fling.pairing.cancel();
    dispatch({ type: "MODAL_CLOSE", modal: "pairing" });
  };

  const retry = () => {
    setMode("qr");
    setStatus(null);
    setQrText(null);
    setShowHint(false);
    void window.fling.pairing.startQr().then((r) => setQrText(r.qrText));
  };

  const submitCode = () => {
    const portNum = parseInt(port, 10);
    if (!host || !portNum || !code) return;
    void window.fling.pairing.startWithCode({ host, port: portNum, code });
  };

  const pillClass =
    status?.kind === "success" ? styles.success :
    status?.kind === "error" || status?.kind === "timeout" ? styles.error :
    "";

  const pillText =
    !status || status.kind === "waiting" ? "Waiting for phone…" :
    status.kind === "pairing" ? "Pairing…" :
    status.kind === "connecting" ? "Connecting…" :
    status.kind === "success" ? "Connected" :
    status.kind === "timeout" ? "Couldn't find your phone. Make sure WiFi is on and try again." :
    `Pairing failed: ${status.reason}`;

  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <p className={styles.title}>Pair a phone</p>
        <p className={styles.subtitle}>
          {mode === "qr" ? "Three steps. Takes about a minute." : "Enter what the phone shows you."}
        </p>

        {mode === "qr" ? (
          <>
            <div className={styles.step}>
              <div className={styles.stepNum}>1</div>
              <div className={styles.stepText}>
                On your phone, open <code>Developer options → Wireless debugging</code>.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>2</div>
              <div className={styles.stepText}>Tap <strong>Pair device with QR code</strong>.</div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>3</div>
              <div className={styles.stepText}>Point your phone at this QR code:</div>
            </div>
            <div className={styles.qrWrap}>
              <canvas ref={canvasRef} className={styles.qrCanvas} width={180} height={180} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.step}>
              <div className={styles.stepNum}>1</div>
              <div className={styles.stepText}>
                On your phone, tap <strong>Pair device with pairing code</strong> under Wireless debugging.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>2</div>
              <div className={styles.stepText}>Type the IP, port, and 6-digit code it shows you:</div>
            </div>
            <label className={styles.field}>Host
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.42" />
            </label>
            <label className={styles.field}>Port
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="43581" inputMode="numeric" />
            </label>
            <label className={styles.field}>Code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="836281" inputMode="numeric" />
            </label>
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={submitCode}>Pair</button>
            </div>
          </>
        )}

        <div className={`${styles.pill} ${pillClass}`}>{pillText}</div>

        {showHint && status?.kind === "waiting" && (
          <p className={styles.hint}>
            On a corporate or guest WiFi? mDNS may be blocked — try the pairing code path.
          </p>
        )}

        {status?.kind === "error" && status.rawAdbError && (
          <details>
            <summary className={styles.hint}>adb output</summary>
            <pre className={styles.rawError}>{status.rawAdbError}</pre>
          </details>
        )}

        {(status?.kind === "error" || status?.kind === "timeout") && (
          <div className={styles.actions}>
            <button className={styles.button} onClick={retry}>Retry</button>
          </div>
        )}

        <button className={styles.fallback} onClick={() => setMode(mode === "qr" ? "code" : "qr")}>
          {mode === "qr" ? "Use pairing code instead →" : "Use QR code instead →"}
        </button>

        <div className={styles.actions}>
          <button className={styles.button} onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
