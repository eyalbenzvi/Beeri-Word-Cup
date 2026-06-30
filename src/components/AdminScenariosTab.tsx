import ScenariosSection from "./ScenariosSection";
import ScenarioInfographicPanel from "./ScenarioInfographicPanel";

// The scenario tool is now computed server-side (after every result) and is
// available to all users under the "נתונים" tab. The admin tab reuses the same
// read-only view and adds a manual "recompute now" poke, plus an admin-only
// infographic "page" (likely finals + favorite form per scenario) that exports
// to a shareable PNG.
export default function AdminScenariosTab() {
  return (
    <div className="space-y-4">
      <ScenarioInfographicPanel />
      <ScenariosSection showRecompute />
    </div>
  );
}
