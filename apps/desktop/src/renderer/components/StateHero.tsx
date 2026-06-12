import { useFling } from "../state/FlingContext";
import styles from "./StateHero.module.css";

export function StateHero() {
  const { state } = useFling();
  const ready = state.devices.find((d) => d.state === "device");
  if (ready) return null;
  const unauthorized = state.devices.find((d) => d.state === "unauthorized");
  const offline = state.devices.find((d) => d.state === "offline");

  if (!state.adbOk) {
    return (
      <div className={styles.hero}>
        <h2>ADB not found</h2>
        <p>Install Android Platform Tools, then restart Fling.</p>
        <a href="https://github.com/eleutex/fling#setup-one-time" target="_blank" rel="noreferrer">Setup docs ↗</a>
      </div>
    );
  }
  if (unauthorized) {
    return (
      <div className={styles.hero}>
        <h2>Phone connected but not authorized</h2>
        <p>Accept the RSA prompt on the device.</p>
      </div>
    );
  }
  if (offline) {
    return (
      <div className={styles.hero}>
        <h2>Device offline</h2>
        <p>Unplug and replug, or run <code>adb kill-server</code>.</p>
      </div>
    );
  }
  return (
    <div className={styles.hero}>
      <h2>No phone detected</h2>
      <p>Plug a phone in over USB.</p>
      <p className={styles.fine}>Wireless pairing lands in a follow-up release.</p>
    </div>
  );
}
