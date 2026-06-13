import { useEffect, useRef, useState } from "react";
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
import { SideControls } from "./components/SideControls";
import { CornerResize } from "./components/CornerResize";
import { SettingsIcon, FolderIcon } from "./components/Icons";

// Pixels from the window's right edge that count as "right-side hover."
// Must comfortably contain the SideControls column (sideArea width 72px +
// some margin so the mouse can rest on the buttons without losing hover).
const RIGHT_HOVER_BAND = 140;
// Pixels from the top of the window that the hover band starts. Excludes
// the toolbar / WindowControls area so hovering the close button doesn't
// trigger SideControls.
const TOP_HOVER_EXCLUDE = 80;

function Body() {
  const { state } = useFling();
  const mirrorCtrl = useMirrorControl();
  // Tracks the serial we've already auto-started for. Reset when no ready
  // device is present so disconnect → reconnect re-triggers auto-mirror.
  const autoStartedSerialRef = useRef<string | null>(null);
  // Right-side hover state — drives the fade-in of SideControls. True when
  // the pointer is within RIGHT_HOVER_BAND px of the window's right edge
  // AND below the toolbar.
  const [rightHover, setRightHover] = useState(false);
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
    <div
      className={styles.app}
      onMouseMove={(e) => {
        // React's synthetic event delegation — one listener at the root,
        // routed here. Cheaper than addEventListener("mousemove") which
        // would fire alongside React's listener for every mouse move.
        const fromRight = window.innerWidth - e.clientX;
        const inBand = fromRight >= 0 && fromRight < RIGHT_HOVER_BAND && e.clientY > TOP_HOVER_EXCLUDE;
        if (inBand !== rightHover) setRightHover(inBand);
      }}
      onMouseLeave={() => { if (rightHover) setRightHover(false); }}
    >
      <div className={styles.mainArea}>
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
            className={styles.shellWrap}
            style={
              state.mirror.width && state.mirror.height
                ? ({ "--phone-aspect": `${state.mirror.width} / ${state.mirror.height}` } as React.CSSProperties)
                : undefined
            }
          >
            <div className={styles.canvas}>
              {mirroring ? <MirrorCanvas /> : <StateHero />}
            </div>
            <CornerResize />
          </div>
        </div>
      </div>
      <div className={styles.sideArea}>
        {mirroring && <SideControls visible={rightHover} />}
      </div>
      <DevicePickerPopover />
      <OpacityPopover />
    </div>
  );
}

export function App() {
  return (
    <FlingProvider>
      <Body />
    </FlingProvider>
  );
}
