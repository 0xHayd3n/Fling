import styles from "./WindowControls.module.css";

export function WindowControls() {
  return (
    <div className={styles.controls}>
      <button className={styles.btn} aria-label="Minimize" onClick={() => window.fling.window.minimize()}>—</button>
      <button className={styles.btn} aria-label="Maximize" onClick={() => window.fling.window.maximize()}>□</button>
      <button className={`${styles.btn} ${styles.close}`} aria-label="Close" onClick={() => window.fling.window.close()}>✕</button>
    </div>
  );
}
