export const KNOCKOUT_STAGE_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];

export const STAGE_LABELS = {
  R32: "שלב ה-32",
  R16: "שמינית גמר",
  QF: "רבע גמר",
  SF: "חצי גמר",
  "3RD": "מקום שלישי",
  F: "גמר",
};

export function getStageLabel(stage) {
  return STAGE_LABELS[stage] || stage;
}
