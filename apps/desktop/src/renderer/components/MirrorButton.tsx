import { useRef } from "react";
import { useFling } from "../state/FlingContext";
import { ToolbarButton } from "./ToolbarButton";
import { PhoneIcon, ChevronDownIcon } from "./Icons";
import styles from "./MirrorButton.module.css";

const LONG_PRESS_MS = 300;

export function MirrorButton() {
  const { state, dispatch } = useFling();
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

  const startMirror = async () => {
    const deviceId = resolveDeviceId();
    if (!deviceId) { dispatch({ type: "MODAL_OPEN", modal: "devicePicker" }); return; }
    dispatch({ type: "MIRROR_STARTING", deviceId });
    try {
      const res = await window.fling.mirror.start({ deviceId });
      dispatch({ type: "MIRROR_STARTED", res, deviceId });
    } catch (err) {
      dispatch({ type: "MIRROR_STOPPED" });
      console.error(err);
    }
  };
  const stopMirror = async () => {
    if (!state.mirror.mirrorId) return;
    dispatch({ type: "MIRROR_STOPPING" });
    try {
      await window.fling.mirror.stop({ mirrorId: state.mirror.mirrorId });
    } catch (err) {
      console.error("[mirror.stop]", err);
    } finally {
      // Always land in "off" even if stop IPC threw — otherwise the UI is
      // stuck in "stopping" with no recovery path.
      dispatch({ type: "MIRROR_STOPPED" });
    }
  };

  const onClick = () => {
    if (fired.current) { fired.current = false; return; }
    if (isOn) void stopMirror(); else void startMirror();
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
      <PhoneIcon />
      <span className={styles.chev}><ChevronDownIcon /></span>
    </ToolbarButton>
  );
}
