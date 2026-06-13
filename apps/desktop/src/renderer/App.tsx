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
import { SettingsIcon, FolderIcon } from "./components/Icons";

// Hover band around the right edge of the shell: how far inside (px) and how
// far outside (px) count as "right-side hover." The outside number must cover
// the SideControls column position + width with some margin so the mouse can
// rest on the buttons themselves without losing hover state.
const RIGHT_HOVER_BAND_INSIDE = 60;
const RIGHT_HOVER_BAND_OUTSIDE = 100;

function Body() {
  const { state } = useFling();
  const mirrorCtrl = useMirrorControl();
  // Tracks the serial we've already auto-started for. Reset when no ready
  // device is present so disconnect → reconnect re-triggers auto-mirror.
  const autoStartedSerialRef = useRef<string | null>(null);
  // Ref to the shell wrap so onMouseMove on canvasFrame can compute distance
  // from the shell's right edge.
  const shellWrapRef = useRef<HTMLDivElement>(null);
  // Right-side hover state — drives the fade-in of SideControls. True when
  // the pointer is within the band straddling the shell's right edge.
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
      <div
        className={styles.canvasFrame}
        onMouseMove={(e) => {
          const wrap = shellWrapRef.current;
          if (!wrap) return;
          const rect = wrap.getBoundingClientRect();
          const dxRight = e.clientX - rect.right;
          const inX = dxRight >= -RIGHT_HOVER_BAND_INSIDE && dxRight <= RIGHT_HOVER_BAND_OUTSIDE;
          const inY = e.clientY >= rect.top && e.clientY <= rect.bottom;
          const shouldShow = inX && inY;
          if (shouldShow !== rightHover) setRightHover(shouldShow);
        }}
        onMouseLeave={() => { if (rightHover) setRightHover(false); }}
      >
        <div
          ref={shellWrapRef}
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
          {mirroring && <SideControls visible={rightHover} />}
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
