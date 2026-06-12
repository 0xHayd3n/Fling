import styles from "./App.module.css";
import { FlingProvider } from "./state/FlingContext";
import { Toolbar } from "./components/Toolbar";
import { ToolbarButton } from "./components/ToolbarButton";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { WindowControls } from "./components/WindowControls";
import { StateHero } from "./components/StateHero";

export function App() {
  return (
    <FlingProvider>
      <div className={styles.app}>
        <Toolbar
          left={
            <>
              <ToolbarButton disabled>Settings</ToolbarButton>
              <ToolbarButton disabled>Open Project</ToolbarButton>
              <ToolbarButton disabled>Mirror</ToolbarButton>
              <ConnectionIndicator />
            </>
          }
          right={<WindowControls />}
        />
        <div className={styles.canvas}>
          <StateHero />
        </div>
      </div>
    </FlingProvider>
  );
}
