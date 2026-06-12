import type { ReactNode } from "react";
import styles from "./Toolbar.module.css";

export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>{left}</div>
      <div className={styles.spacer} />
      <div className={styles.right}>{right}</div>
    </div>
  );
}
