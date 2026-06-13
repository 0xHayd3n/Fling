import { useEffect, useRef } from "react";
import { useFling } from "../state/FlingContext";
import styles from "./OpacityPopover.module.css";

export function OpacityPopover() {
  const { state, dispatch } = useFling();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.modals.opacity) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        dispatch({ type: "MODAL_CLOSE", modal: "opacity" });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "MODAL_CLOSE", modal: "opacity" });
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.modals.opacity, dispatch]);

  if (!state.modals.opacity) return null;

  const percent = Math.round(state.window.opacity * 100);

  return (
    <div className={styles.popover} ref={ref}>
      <div className={styles.label}>
        <span>Window opacity</span>
        <span>{percent}%</span>
      </div>
      <input
        className={styles.slider}
        type="range"
        min={30}
        max={100}
        step={5}
        value={percent}
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value) / 100;
          dispatch({ type: "WINDOW_SET_OPACITY", opacity: v });
        }}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value) / 100;
          dispatch({ type: "WINDOW_SET_OPACITY", opacity: v });
        }}
      />
      <button
        className={styles.reset}
        type="button"
        onClick={() => dispatch({ type: "WINDOW_SET_OPACITY", opacity: 1.0 })}
      >
        Reset opacity to 100%
      </button>
    </div>
  );
}
