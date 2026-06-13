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

function Body() {
  const { state } = useFling();
  const mirroring = state.mirror.status === "running" || state.mirror.status === "starting";
  return (
    <>
      <Toolbar
        left={
          <>
            <ToolbarButton disabled>Settings</ToolbarButton>
            <ToolbarButton disabled>Open Project</ToolbarButton>
            <MirrorButton />
            <ConnectionIndicator />
          </>
        }
        right={<WindowControls />}
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
