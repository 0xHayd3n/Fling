import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ToolbarButton.module.css";

export function ToolbarButton({
  children, onContextMenu, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={`${styles.btn} ${className ?? ""}`} onContextMenu={onContextMenu} {...rest}>
      {children}
    </button>
  );
}
