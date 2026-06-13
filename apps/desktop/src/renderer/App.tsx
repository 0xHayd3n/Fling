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
  // Tracks the serial we've already auto-started for. Reset when no ready
  // device is present so disconnect → reconnect re-triggers auto-mirror.
  // (A boolean ref never reset would suppress recovery forever.)
  const autoStartedSerialRef = useRef<string | null>(null);
  const mirroring = state.mirror.status === "running" || state.mirror.status === "starting";

  // Auto-mirror on launch: when a single ready device appears, start the
  // mirror automatically — but only once per device-appearance, not once
  // per app lifetime.
  useEffect(() => {
    if (state.mirror.status !== "off") return;
    const ready = state.devices.filter((d) => d.state === "device");
    if (ready.length === 0) {
      autoStartedSerialRef.current = null;
      return;
    }
    if (ready.length !== 1) return;
    const deviceId = ready[0]!.serial;
    if (autoStartedSerialRef.current === deviceId) return;
    autoStartedSerialRef.current = deviceId;
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
