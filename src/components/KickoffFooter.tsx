// Tournament-kickoff footer line for the countdown card, rendered in the
// viewer's own timezone. For users in Israel this reads exactly as before —
// "11 ביוני 2026 · 22:00 שעון ישראל · …" — while visitors abroad see their
// local kickoff time with a "שעון מקומי" note. Shared by Home + WelcomeScreen.
import { BRAND, TIME } from "../constants/messages";
import { KICKOFF_UTC } from "../utils/constants";
import {
  formatLongDateHe,
  formatClockFromMs,
  isIsraelTimeZone,
} from "../utils/userTime";

export default function KickoffFooter() {
  return (
    <>
      {formatLongDateHe(KICKOFF_UTC)} · <bdi>{formatClockFromMs(KICKOFF_UTC)}</bdi>{" "}
      {isIsraelTimeZone() ? TIME.israelClock : TIME.localClock} · {BRAND.hosts}
    </>
  );
}
