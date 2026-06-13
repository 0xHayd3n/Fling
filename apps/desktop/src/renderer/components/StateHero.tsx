import { useFling } from "../state/FlingContext";
import styles from "./StateHero.module.css";

export function StateHero() {
  const { state, dispatch } = useFling();
  const ready = state.devices.find((d) => d.state === "device");
  const unauthorized = state.devices.find((d) => d.state === "unauthorized");
  const offline = state.devices.find((d) => d.state === "offline");

  // Mirror just ended unexpectedly — show why instead of the idle hero so
  // the user understands the canvas vanished (not just "nothing happened").
  // Wins over the ready/unauthorized/offline checks because the error
  // happened to THIS session and is more relevant right now.
  let inner;
  if (state.mirror.status === "error") {
    inner = (
      <>
        <h2>Mirror disconnected</h2>
        <p>{state.mirror.errorReason ?? "Unknown reason"}</p>
        <p className={styles.fine}>{ready ? "Reconnecting…" : "Plug the device back in."}</p>
      </>
    );
  } else if (ready) {
    return null;
  } else if (!state.adbOk) {
    inner = (
      <>
        <h2>ADB not found</h2>
        <p>Install Android Platform Tools, then restart Fling.</p>
        <a href="https://github.com/eleutex/fling#setup-one-time" target="_blank" rel="noreferrer">Setup docs ↗</a>
      </>
    );
  } else if (unauthorized) {
    inner = (
      <>
        <h2>Phone connected but not authorized</h2>
        <p>Accept the RSA prompt on the device.</p>
      </>
    );
  } else if (offline) {
    inner = (
      <>
        <h2>Device offline</h2>
        <p>Unplug and replug, or run <code>adb kill-server</code>.</p>
      </>
    );
  } else {
    inner = (
      <>
        <h2>No phone detected</h2>
        <p>Plug a phone in over USB, or pair wirelessly:</p>
        <button
          className={styles.heroButton}
          onClick={() => dispatch({ type: "MODAL_OPEN", modal: "pairing" })}
        >
          Pair wirelessly →
        </button>
      </>
    );
  }

  return (
    <div className={styles.hero}>
      <div className={styles.card}>{inner}</div>
    </div>
  );
}
