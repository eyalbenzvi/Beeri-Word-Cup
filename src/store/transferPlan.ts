// Pure planning step for adminTransferForm — extracted so the decision logic
// (target validation, no-op, formId generation, field preservation) is
// unit-testable WITHOUT pulling Firestore into the test process. The store fn
// performs the side effects (atomic batch write, cache, audit) around this.
//
// Ownership of a form is the `userId` field ONLY (nothing parses the formId
// prefix). A transfer overrides exactly that field and preserves every other
// field verbatim — this is a MOVE.

export type TransferPlan =
  | { error: "form-not-found" | "target-not-found" }
  | { noop: true; fromUid: string }
  | { fromUid: string; newFormId: string; newData: Record<string, any> };

export function planFormTransfer(
  form: any,
  targetUid: string,
  usersMap: Record<string, any>,
  now: number = Date.now(),
  rand: number = Math.random(),
): TransferPlan {
  if (!form) return { error: "form-not-found" };
  // Validate against the real users map (the same source the picker renders
  // from) — not a directory-only fallback that could accept a stale entry.
  if (!usersMap || !usersMap[targetUid]) return { error: "target-not-found" };
  const fromUid = form.userId;
  if (targetUid === fromUid) return { noop: true, fromUid };
  // Collision-safe, fixed width: 13-digit epoch + 3 random digits = 16
  // digits, which stays within the create-rule's ^uid__\d{10,16}$ bound.
  const suffix = String(Math.floor(rand * 1000)).padStart(3, "0");
  const newFormId = `${targetUid}__${now}${suffix}`;
  return { fromUid, newFormId, newData: { ...form, userId: targetUid } };
}
