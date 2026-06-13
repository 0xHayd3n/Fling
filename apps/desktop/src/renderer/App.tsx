import { useEffect, useRef } from "react";
import styles from "./App.module.css";
import { FlingProvider, useFling } from "./state/FlingContext";
import { useMirrorControl } from "./state/useMirrorControl";
import { Toolbar } from "./components/Toolbar";
import { ToolbarButton } from "./components/ToolbarButton";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { WindowControls } from "./components/WindowControls";
import { StateHero } from "./components/StateHero";
import { MirrorButton } from "./components/MirrorButton";
import { MirrorCanvas } from "./components/MirrorCanvas";
import { DevicePickerPopover } from "./components/DevicePickerPopover";
import { PinButton } from "./components/PinButton";
import { OpacityPopover } from "./components/OpacityPopover";
import { SettingsIcon, FolderIcon } from "./components/Icons";

function Body() {
  const { state } = useFling();
  const mirrorCtrl = useMirrorControl();
  // Tracks the serial we've already auto-started for. Reset when no ready
  // device is present so disconnect → reconnect re-triggers auto-mirror.
  const autoStartedSerialRef = useRef<string | null>(null);
  // Keep canvas mounted during stopping/starting so the user doesn't see the
  // StateHero flash through. Only "off" and "error" go to the hero.
  const mirroring = state.mirror.status === "running"
    || state.mirror.status === "starting"
    || state.mirror.status === "stopping";

  // Auto-mirror on launch: when a single ready device appears, start the
  // mirror automatically — but only once per device-appearance, not once
  // per app lifetime. Eligible from "off" and "error" (so device reconnect
  // after a crash auto-recovers); the serial ref prevents retry loops.
  useEffect(() => {
    if (state.mirror.status !== "off" && state.mirror.status !== "error") return;
    const ready = state.devices.filter((d) => d.state === "device");
    if (ready.length === 0) {
      autoStartedSerialRef.current = null;
      return;
    }
    if (ready.length !== 1) return;
    const deviceId = ready[0]!.serial;
    if (autoStartedSerialRef.current === deviceId) return;
    autoStartedSerialRef.current = deviceId;
    void mirrorCtrl.start(deviceId).catch(() => { /* dispatched MIRROR_STOPPED already */ });
  }, [state.devices, state.mirror.status, mirrorCtrl]);

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
            <PinButton />
          </>
        }
        right={<WindowControls />}
        bottom={<ConnectionIndicator />}
      />
      <div className={styles.canvasFrame}>
        <div
          className={styles.canvas}
          style={
            state.mirror.width && state.mirror.height
              ? ({ "--phone-aspect": `${state.mirror.width} / ${state.mirror.height}` } as React.CSSProperties)
              : undefined
          }
        >
          {mirroring ? <MirrorCanvas /> : <StateHero />}
        </div>
      </div>
      <DevicePickerPopover />
      <OpacityPopover />
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
