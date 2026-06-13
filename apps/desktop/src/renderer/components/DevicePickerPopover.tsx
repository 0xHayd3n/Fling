import { useEffect, useRef } from "react";
import { useFling } from "../state/FlingContext";
import styles from "./DevicePickerPopover.module.css";

export function DevicePickerPopover() {
  const { state, dispatch } = useFling();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.modals.devicePicker) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        dispatch({ type: "MODAL_CLOSE", modal: "devicePicker" });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "MODAL_CLOSE", modal: "devicePicker" });
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.modals.devicePicker, dispatch]);

  if (!state.modals.devicePicker) return null;

  const pick = async (serial: string) => {
    dispatch({ type: "SELECT_DEVICE", deviceId: serial });
    dispatch({ type: "MODAL_CLOSE", modal: "devicePicker" });
    if (state.mirror.mirrorId) await window.fling.mirror.stop({ mirrorId: state.mirror.mirrorId });
    dispatch({ type: "MIRROR_STARTING", deviceId: serial });
    try {
      const res = await window.fling.mirror.start({ deviceId: serial });
      dispatch({ type: "MIRROR_STARTED", res, deviceId: serial });
    } catch (err) {
      dispatch({ type: "MIRROR_STOPPED" });
      console.error(err);
    }
  };

  return (
    <div className={styles.popover} ref={ref}>
      {state.devices.length === 0 && <div className={styles.empty}>No devices connected</div>}
      {state.devices.map((d) => (
        <button
          key={d.serial}
          className={styles.row}
          disabled={d.state !== "device"}
          onClick={() => void pick(d.serial)}
        >
          <span className={styles.model}>{d.model ?? d.serial}</span>
          <span className={styles.serial}>{d.serial}</span>
          <span className={`${styles.state} ${styles[d.state.replace(" ", "")] ?? ""}`}>{d.state}</span>
        </button>
      ))}
    </div>
  );
}
