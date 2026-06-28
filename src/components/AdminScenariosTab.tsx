import ScenariosSection from "./ScenariosSection";

// The scenario tool is now computed server-side (after every result) and is
// available to all users under the "נתונים" tab. The admin tab reuses the same
// read-only view and adds a manual "recompute now" poke.
export default function AdminScenariosTab() {
  return <ScenariosSection showRecompute />;
}
