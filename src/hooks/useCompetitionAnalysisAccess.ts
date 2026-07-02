// Access gate for the competition-analysis feature ("המצב שלי בתחרות").
//
// `visible` is TRUE only when ALL of:
//   - settings have been SERVER-confirmed (not a stale/offline cache default —
//     the CLAUDE.md race-condition discipline: gates must distinguish "we know
//     it's X" from "we haven't asked yet", so the entry button never flashes)
//   - the admin flag releases this specific user (featureFlags.ts)
//
// `locked` mirrors the Simulator/Leaderboard lock-screen semantics for the
// page itself (pre-lock there is nothing to analyse — predictions are still
// editable and other users' forms aren't readable).

import { useCurrentUser, useSettings, useSettingsServerConfirmed } from "./useStore";
import { canUseCompetitionAnalysis } from "../utils/featureFlags";

export function useCompetitionAnalysisAccess(): {
  visible: boolean;
  confirmed: boolean;
  locked: boolean;
  user: any;
} {
  const { user } = useCurrentUser();
  const settings = useSettings();
  const confirmed = useSettingsServerConfirmed();

  return {
    visible: !!confirmed && canUseCompetitionAnalysis(settings, user),
    confirmed: !!confirmed,
    locked: settings?.predictionsLocked === true,
    user,
  };
}
