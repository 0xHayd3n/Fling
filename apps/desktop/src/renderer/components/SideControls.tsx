import { useFling } from "../state/FlingContext";
import {
  encodeKeyTap,
  KEYCODE_POWER,
  KEYCODE_VOLUME_UP,
  KEYCODE_VOLUME_DOWN,
} from "../lib/scrcpyControl";
import { PowerIcon, PlusIcon, MinusIcon } from "./Icons";
import styles from "./SideControls.module.css";

export function SideControls({ visible }: { visible: boolean }) {
  const { state } = useFling();

  const sendKey = (keycode: number) => {
    if (!state.mirror.mirrorId) return;
    const bytes = encodeKeyTap(keycode);
    void window.fling.mirror.input({
      mirrorId: state.mirror.mirrorId,
      event: {
        kind: "key",
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      },
    });
  };

  return (
    <div className={`${styles.column} ${visible ? styles.visible : ""}`}>
      <button
        className={`${styles.btn} ${styles.power}`}
        onClick={() => sendKey(KEYCODE_POWER)}
        title="Power"
        aria-label="Power"
      >
        <PowerIcon />
      </button>
      <button
        className={styles.btn}
        onClick={() => sendKey(KEYCODE_VOLUME_UP)}
        title="Volume up"
        aria-label="Volume up"
      >
        <PlusIcon />
      </button>
      <button
        className={styles.btn}
        onClick={() => sendKey(KEYCODE_VOLUME_DOWN)}
        title="Volume down"
        aria-label="Volume down"
      >
        <MinusIcon />
      </button>
    </div>
  );
}
