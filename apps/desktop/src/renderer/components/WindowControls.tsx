import styles from "./WindowControls.module.css";
import { MinimizeIcon, MaximizeIcon, CloseIcon } from "./Icons";

export function WindowControls() {
  return (
    <div className={styles.controls}>
      <button className={styles.btn} aria-label="Minimize" onClick={() => window.fling.window.minimize()}>
        <MinimizeIcon />
      </button>
      <button className={styles.btn} aria-label="Maximize" onClick={() => window.fling.window.maximize()}>
        <MaximizeIcon />
      </button>
      <button className={`${styles.btn} ${styles.close}`} aria-label="Close" onClick={() => window.fling.window.close()}>
        <CloseIcon />
      </button>
    </div>
  );
}
