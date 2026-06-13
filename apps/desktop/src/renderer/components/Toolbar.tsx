import type { ReactNode } from "react";
import styles from "./Toolbar.module.css";

export function Toolbar({
  left, right, bottom,
}: { left?: ReactNode; right?: ReactNode; bottom?: ReactNode }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <div className={styles.left}>{left}</div>
        <div className={styles.spacer} />
        <div className={styles.right}>{right}</div>
      </div>
      {bottom && <div className={styles.bottomRow}>{bottom}</div>}
    </div>
  );
}
