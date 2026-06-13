import { useRef } from "react";
import { useFling } from "../state/FlingContext";
import { useMirrorControl } from "../state/useMirrorControl";
import { ToolbarButton } from "./ToolbarButton";
import { RefreshIcon, ChevronDownIcon } from "./Icons";
import styles from "./MirrorButton.module.css";

const LONG_PRESS_MS = 300;

export function MirrorButton() {
  const { state, dispatch } = useFling();
  const mirrorCtrl = useMirrorControl();
  const pressTimer = useRef<number | null>(null);
  const fired = useRef(false);

  const ready = state.devices.filter((d) => d.state === "device");
  const canMirror = ready.length > 0;
  const status = state.mirror.status;
  // "On" = the button shows Stop. Only when there is an active session to
  // stop. Transitional states (starting/stopping) show but are disabled.
  const isOn = status === "running";
  const inTransition = status === "starting" || status === "stopping";

  const resolveDeviceId = (): string | null => {
    if (state.selectedDeviceId) return state.selectedDeviceId;
    if (ready.length === 1) return ready[0]!.serial;
    return null;
  };

  const onClick = () => {
    if (fired.current) { fired.current = false; return; }
    if (isOn) {
      void mirrorCtrl.stop();
    } else {
      const deviceId = resolveDeviceId();
      if (!deviceId) { dispatch({ type: "MODAL_OPEN", modal: "devicePicker" }); return; }
      void mirrorCtrl.start(deviceId).catch(() => { /* hook already dispatched MIRROR_STOPPED */ });
    }
  };

  return (
    <ToolbarButton
      className={styles.btn}
      disabled={inTransition || (!canMirror && !isOn)}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); dispatch({ type: "MODAL_OPEN", modal: "devicePicker" }); }}
      onPointerDown={() => {
        fired.current = false;
        pressTimer.current = window.setTimeout(() => {
          fired.current = true;
          dispatch({ type: "MODAL_OPEN", modal: "devicePicker" });
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }}
      onPointerLeave={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }}
      title="Mirror (right-click for device list)"
      aria-label="Mirror"
    >
      <span className={inTransition ? styles.iconSpinning : styles.icon}>
        <RefreshIcon />
      </span>
      <span className={styles.chev}><ChevronDownIcon /></span>
    </ToolbarButton>
  );
}
