import { useEffect, useRef } from "react";
import styles from "./App.module.css";
import { FlingProvider, useFling } from "./state/FlingContext";
import { Toolbar } from "./components/Toolbar";
import { ToolbarButton } from "./components/ToolbarButton";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { WindowControls } from "./components/WindowControls";
import { StateHero } from "./components/StateHero";
import { MirrorButton } from "./components/MirrorButton";
import { MirrorCanvas } from "./components/MirrorCanvas";
import { DevicePickerPopover } from "./components/DevicePickerPopover";
import { SettingsIcon, FolderIcon } from "./components/Icons";

function Body() {
  const { state, dispatch } = useFling();
  const autoStartedRef = useRef(false);
  const mirroring = state.mirror.status === "running" || state.mirror.status === "starting";

  // Auto-mirror on launch: when a single ready device appears and we haven't
  // already tried this session, start the mirror automatically.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (state.mirror.status !== "off") return;
    const ready = state.devices.filter((d) => d.state === "device");
    if (ready.length !== 1) return;
    const deviceId = ready[0]!.serial;
    autoStartedRef.current = true;
    void (async () => {
      dispatch({ type: "MIRROR_STARTING", deviceId });
      try {
        const res = await window.fling.mirror.start({ deviceId });
        dispatch({ type: "MIRROR_STARTED", res, deviceId });
      } catch (err) {
        dispatch({ type: "MIRROR_STOPPED" });
        console.error("[auto-mirror]", err);
      }
    })();
  }, [state.devices, state.mirror.status, dispatch]);

  return (
    <>
      <Toolbar
        left={
          <>
            <ToolbarButton disabled title="Settings" aria-label="Settings">
              <SettingsIcon />
            </ToolbarButton>
            <ToolbarButton disabled title="Open Project" aria-label="Open Project">
              <FolderIcon />
            </ToolbarButton>
            <MirrorButton />
          </>
        }
        right={<WindowControls />}
        bottom={<ConnectionIndicator />}
      />
      <div className={styles.canvas}>
        {mirroring ? <MirrorCanvas /> : <StateHero />}
      </div>
      <DevicePickerPopover />
    </>
  );
}

export function App() {
  return (
    <FlingProvider>
      <div className={styles.app}>
        <Body />
      </div>
    </FlingProvider>
  );
}
