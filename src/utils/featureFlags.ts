/**
 * Feature-flag evaluation for admin-controlled gradual rollout.
 *
 * The flag lives in the EXISTING gameData/settings doc (public-read,
 * admin-write — same doc as predictionsLocked / bestCaseEnabled) under a
 * `features` map, so no Firestore-rules change and no new listener are
 * needed: every client already subscribes to settings in real time.
 *
 *   settings.features = {
 *     competitionAnalysis: { mode: "off"|"admin"|"allowlist"|"all", allow: [uid...] }
 *   }
 *
 * Contract (fail-closed): a missing/malformed flag, an unknown mode, or a
 * non-array allowlist all evaluate to FALSE. Old clients ignore the unknown
 * `features` key entirely (all settings consumers read named fields).
 *
 * This is a ROLLOUT mechanism, not a security boundary — the settings doc is
 * public and the JS bundle ships to everyone. Data access stays governed by
 * Firestore rules alone.
 */

export type FeatureFlagMode = "off" | "admin" | "allowlist" | "all";

export type FeatureFlag = {
  mode?: FeatureFlagMode;
  allow?: string[];
};

export const COMPETITION_ANALYSIS_FLAG = "competitionAnalysis";

export function getCompetitionAnalysisFlag(settings: any): FeatureFlag {
  const flag = settings?.features?.[COMPETITION_ANALYSIS_FLAG];
  return flag && typeof flag === "object" ? flag : {};
}

// Evaluate whether `user` (the store's current-user record: { id, isAdmin? })
// may see the competition-analysis feature. Admin sees it in every mode
// except "off" — the admin is always the first rollout ring.
export function canUseCompetitionAnalysis(settings: any, user: any): boolean {
  if (!user?.id) return false;
  const flag = getCompetitionAnalysisFlag(settings);
  const isAdmin = user.isAdmin === true;
  switch (flag.mode) {
    case "admin":
      return isAdmin;
    case "allowlist":
      return isAdmin || (Array.isArray(flag.allow) && flag.allow.includes(user.id));
    case "all":
      return true;
    default:
      // "off", missing, or an unrecognised value from a future client.
      return false;
  }
}
