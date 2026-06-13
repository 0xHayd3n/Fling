import { useRef } from "react";
import { useFling } from "../state/FlingContext";
import { ToolbarButton } from "./ToolbarButton";
import { PinIcon, PinFilledIcon } from "./Icons";
import styles from "./PinButton.module.css";

const LONG_PRESS_MS = 300;

export function PinButton() {
  const { state, dispatch } = useFling();
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const isPinned = state.window.isPinned;
  const isModified = isPinned || state.window.opacity < 1.0;

  const togglePin = () => {
    dispatch({ type: "WINDOW_SET_PIN", pinned: !isPinned });
  };

  const openOpacity = () => {
    dispatch({ type: "MODAL_OPEN", modal: "opacity" });
  };

  const onClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    togglePin();
  };

  return (
    <ToolbarButton
      className={`${styles.btn} ${isModified ? styles.active : ""}`}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); openOpacity(); }}
      onPointerDown={() => {
        longPressFired.current = false;
        pressTimer.current = window.setTimeout(() => {
          longPressFired.current = true;
          openOpacity();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      }}
      onPointerLeave={() => {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      }}
      title={isPinned ? "Unpin window (long-press for opacity)" : "Pin window on top (long-press for opacity)"}
      aria-label="Pin window"
    >
      {isPinned ? <PinFilledIcon /> : <PinIcon />}
    </ToolbarButton>
  );
}
