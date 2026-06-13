// Shared football-data.org team-code helpers.
//
// football-data uses a handful of TLAs that differ from our FIFA codes
// (verified against the live WC squad list). Map FD's code -> ours so every
// comparison downstream happens in our code space. Used by both the
// final-result client (footballData.js) and the live-scores endpoint —
// single source so a new mismatch is fixed in one place.

export const FD_TO_OURS = { CUW: "CUR", URY: "URU" };

export function norm(s) {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

export function ourCode(tla) {
  const c = norm(tla);
  return FD_TO_OURS[c] || c;
}
