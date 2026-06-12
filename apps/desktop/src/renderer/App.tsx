import styles from "./App.module.css";
import { FlingProvider } from "./state/FlingContext";

export function App() {
  return (
    <FlingProvider>
      <div className={styles.app}>
        <div className={styles.placeholder}>Fling Desktop (Phase 2 wired)</div>
      </div>
    </FlingProvider>
  );
}
