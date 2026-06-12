import { useFling } from "../state/FlingContext";
import styles from "./ConnectionIndicator.module.css";

export function ConnectionIndicator() {
  const { state } = useFling();
  const ready = state.devices.find((d) => d.state === "device");
  const trouble = state.devices.find((d) => d.state === "unauthorized" || d.state === "offline");
  const color = ready ? "green" : trouble ? "amber" : "red";
  const label = ready
    ? (ready.model ?? ready.serial)
    : trouble ? trouble.state : "No device";
  const tooltip = ready ? ready.serial : "";

  return (
    <div className={styles.indicator} title={tooltip}>
      <span className={`${styles.dot} ${styles[color]}`} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
