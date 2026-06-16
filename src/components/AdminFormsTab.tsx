import { useState, useMemo } from "react";
import {
  adminForceSubmitForm,
  adminReopenForm,
  adminDeleteForm,
  adminUpdateForm,
  adminSaveMatchPrediction,
  adminApprovePrediction,
  adminTransferForm,
} from "../store";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmModal";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { calcBracketTeams } from "../utils/bracket";
import GroupSelector from "./GroupSelector";
import { LABELS } from "../constants/messages";
import PlayerAutocomplete from "./PlayerAutocomplete";

function AdminFormEditModal({ formId, form, onClose }) {
  const [tab, setTab] = useState("details");
  const [formName, setFormName] = useState(form.formName || "");
  const [budgetNumber, setBudgetNumber] = useState(form.budgetNumber || "");
  const [topScorer, setTopScorer] = useState(form.topScorer || "");
  const [adminNote, setAdminNote] = useState(form.adminNote || "");
  const [editStage, setEditStage] = useState("group");
  const [editGroup, setEditGroup] = useState("A");

  const matchesForEdit = useMemo(() => {
    if (editStage === "group") {
      return groupMatches.filter((m) => m.group === editGroup);
    }
    return knockoutMatches.filter((m) => m.stage === editStage);
  }, [editStage, editGroup]);

  const predBracket = useMemo(
    () => calcBracketTeams(form.matches || {}),
    [form.matches],
  );

  const handleSaveDetails = () => {
    adminUpdateForm(formId, {
      formName: formName.trim() || form.formName,
      budgetNumber: budgetNumber.trim(),
      topScorer: topScorer.trim(),
      adminNote: adminNote.trim(),
    });
    onClose();
  };

  const saveMatchPred = (match, homeScore, awayScore, advancingTeam) => {
    const hs = parseInt(homeScore, 10);
    const as = parseInt(awayScore, 10);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0)
      return;
    const isKo = match.stage && match.stage !== "group";
    const pred: any = { homeScore: hs, awayScore: as };
    if (isKo && hs === as) {
      const teams = predBracket[match.id];
      if (advancingTeam) pred.advancingTeam = advancingTeam;
      else if (teams?.home && teams?.away) {
        pred.advancingTeam = teams.home;
      }
    }
    adminSaveMatchPrediction(formId, match.id, pred);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-h-[90vh] overflow-hidden flex flex-col max-w-lg shadow-xl">
        <div className="flex border-b border-border px-3 pt-3 gap-1">
          {[
            { id: "details", label: "פרטים" },
            { id: "matches", label: "משחקים" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-bold rounded-t-2xl ${
                tab === t.id
                  ? "bg-primary text-white"
                  : "bg-bg-soft text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {tab === "details" && (
            <>
              <div>
                <label className="text-xs text-ink-muted">שם טופס</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-duo mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted">מספר תקציב</label>
                <input
                  value={budgetNumber}
                  onChange={(e) => setBudgetNumber(e.target.value)}
                  className="input-duo mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted">{LABELS.topScorer}</label>
                <div className="mt-0.5">
                  <PlayerAutocomplete
                    value={topScorer}
                    onChange={(val) => setTopScorer(val)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-muted">
                  הערת מנהל (ביקורת)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  className="input-duo mt-0.5"
                  placeholder="תיעוד תיקון..."
                />
              </div>
              <button
                type="button"
                onClick={handleSaveDetails}
                className="btn-duo btn-duo-primary w-full"
              >
                שמור פרטים
              </button>
            </>
          )}
          {tab === "matches" && (
            <>
              <div className="flex flex-wrap gap-1">
                {Object.entries(STAGES).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditStage(key)}
                    className={`px-2 py-1 rounded-xl text-xs font-bold ${
                      editStage === key
                        ? "bg-primary text-white"
                        : "bg-bg-soft text-ink-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {editStage === "group" && (
                <GroupSelector
                  groups={Object.keys(GROUPS)}
                  selectedGroup={editGroup}
                  onSelect={setEditGroup}
                />
              )}
              <div className="space-y-2">
                {matchesForEdit.map((match) => {
                  const pred = form.matches?.[match.id];
                  const rowKey = `${match.id}-${pred?.homeScore ?? ""}-${pred?.awayScore ?? ""}-${pred?.advancingTeam ?? ""}`;
                  const derived =
                    match.stage !== "group" && predBracket[match.id]
                      ? predBracket[match.id]
                      : { home: match.homeTeam, away: match.awayTeam };
                  const homeTeam = getTeamByCode(derived.home);
                  const awayTeam = getTeamByCode(derived.away);
                  const isKo = match.stage && match.stage !== "group";
                  const isTie =
                    pred && Number(pred.homeScore) === Number(pred.awayScore);
                  return (
                    <div
                      key={rowKey}
                      className="border-2 border-border rounded-xl p-2 text-xs"
                    >
                      <div className="text-3xs text-ink-muted mb-1">
                        {match.id}
                        {match.label ? ` · ${match.label}` : ""}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate max-w-[40%]">
                          {homeTeam?.name || "—"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          defaultValue={pred?.homeScore ?? ""}
                          id={`${match.id}-h`}
                          className="w-10 border-2 border-border rounded-xl text-center"
                        />
                        <span>-</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          defaultValue={pred?.awayScore ?? ""}
                          id={`${match.id}-a`}
                          className="w-10 border-2 border-border rounded-xl text-center"
                        />
                        <span className="truncate max-w-[40%]">
                          {awayTeam?.name || "—"}
                        </span>
                        <button
                          type="button"
                          className="btn-duo-flat"
                          style={{ background: "var(--color-primary)", color: "#FFFFFF" }}
                          onClick={() => {
                            const hi = document.getElementById(`${match.id}-h`) as HTMLInputElement | null;
                            const ai = document.getElementById(`${match.id}-a`) as HTMLInputElement | null;
                            saveMatchPred(
                              match,
                              hi?.value,
                              ai?.value,
                              pred?.advancingTeam,
                            );
                          }}
                        >
                          שמור
                        </button>
                      </div>
                      {isKo && isTie && derived.home && derived.away && (
                        <div className="flex gap-1 mt-1 justify-center">
                          <button
                            type="button"
                            className="text-3xs bg-bg-soft px-2 py-0.5 rounded"
                            onClick={() => {
                              const hi = document.getElementById(
                                `${match.id}-h`,
                              ) as HTMLInputElement | null;
                              const ai = document.getElementById(
                                `${match.id}-a`,
                              ) as HTMLInputElement | null;
                              saveMatchPred(
                                match,
                                hi?.value,
                                ai?.value,
                                derived.home,
                              );
                            }}
                          >
                            {homeTeam?.name}
                          </button>
                          <button
                            type="button"
                            className="text-3xs bg-bg-soft px-2 py-0.5 rounded"
                            onClick={() => {
                              const hi = document.getElementById(
                                `${match.id}-h`,
                              ) as HTMLInputElement | null;
                              const ai = document.getElementById(
                                `${match.id}-a`,
                              ) as HTMLInputElement | null;
                              saveMatchPred(
                                match,
                                hi?.value,
                                ai?.value,
                                derived.away,
                              );
                            }}
                          >
                            {awayTeam?.name}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="p-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-ink-muted bg-bg-soft rounded-xl"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

// Transfer a single form's ownership to another user. Two-step inside one
// modal (search → inline confirm) so we never stack a second overlay.
function TransferOwnerModal({ formId, form, users, onClose }) {
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currentOwnerId = form.userId;
  const ownerName = (users[currentOwnerId]?.displayName) || currentOwnerId;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(users)
      .filter(([uid]) => uid !== currentOwnerId)
      .map(([uid, uAny]) => {
        const u = uAny as any;
        const name = [u.displayName, u.firstName, u.lastName]
          .filter(Boolean)
          .join(" ");
        return { uid, email: u.email || "", name: name || uid };
      })
      .filter(({ uid, email, name }) => {
        if (!q) return true;
        return (
          name.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          uid.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .slice(0, 50);
  }, [users, query, currentOwnerId]);

  const selectedName =
    candidates.find((c) => c.uid === selected)?.name ||
    (selected ? (users[selected]?.displayName || selected) : "");

  async function handleConfirm() {
    if (saving || !selected) return;
    setSaving(true);
    const res = await adminTransferForm(formId, selected);
    setSaving(false);
    if (res?.ok) {
      showToast("הבעלות הועברה");
      onClose();
    } else {
      showToast("העברת הבעלות נכשלה", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-h-[90vh] overflow-hidden flex flex-col max-w-lg shadow-xl">
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <div className="font-bold text-primary">העברת בעלות</div>
          <div className="text-xs text-ink-muted mt-0.5">
            טופס: {form.formName || "ללא שם"} · בעלים נוכחי: {ownerName}
          </div>
        </div>

        {!selected && (
          <>
            <div className="p-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש משתמש לפי שם / כינוי / אימייל..."
                className="w-full border border-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-1">
              {candidates.map(({ uid, name, email }) => (
                <button
                  key={uid}
                  type="button"
                  onClick={() => setSelected(uid)}
                  className="w-full text-right card-duo-tight hover:border-primary transition-colors"
                >
                  <div className="text-sm font-medium break-words">{name}</div>
                  {email && (
                    <div className="text-xs text-ink-muted break-all">{email}</div>
                  )}
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="text-center text-ink-muted py-6 text-sm">
                  אין משתמשים תואמים
                </p>
              )}
            </div>
          </>
        )}

        {selected && (
          <div className="p-4 space-y-3 flex-1">
            <p className="text-sm text-ink">
              להעביר את הטופס{" "}
              <span className="font-bold">{form.formName || "ללא שם"}</span> מ-
              <span className="font-bold">{ownerName}</span> ל-
              <span className="font-bold">{selectedName}</span>?
            </p>
            <p className="text-xs text-ink-muted">
              הטופס יירשם על שם {selectedName} ויופיע אצלו, ויוסר מ-{ownerName}.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="btn-duo btn-duo-primary flex-1 disabled:opacity-50"
              >
                {saving ? "מעביר..." : "העבר בעלות"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={saving}
                className="btn-duo btn-duo-ghost flex-1 disabled:opacity-50"
              >
                חזרה
              </button>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full py-2 text-sm text-ink-muted bg-bg-soft rounded-xl disabled:opacity-50"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFormsTab({ users, allPredictions }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [transferId, setTransferId] = useState(null);
  const showToast = useToast();
  const confirm = useConfirm();

  const pendingCount = useMemo(
    () => Object.values(allPredictions).filter((p: any) => p.status === "pending").length,
    [allPredictions],
  );

  const rows = useMemo(() => {
    const mapped = Object.entries(allPredictions).map(([formId, pAny]) => {
      const p = pAny as any;
      return { formId, ...p, userName: users[p.userId]?.displayName || p.userId };
    });

    const filtered = mapped.filter((r) => {
      if (statusFilter === "draft" && r.status !== "draft") return false;
      if (statusFilter === "submitted" && r.status !== "submitted" && r.status !== "approved") return false;
      if (statusFilter === "pending" && r.status !== "pending") return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (r.formName || "").toLowerCase().includes(q) ||
        (r.userName || "").toLowerCase().includes(q) ||
        r.formId.toLowerCase().includes(q)
      );
    });

    if (statusFilter === "pending") {
      return filtered.sort((a, b) =>
        (a.submittedAt || "").localeCompare(b.submittedAt || ""),
      );
    }
    return filtered.sort((a, b) =>
      (b.submittedAt || b.updatedAt || "").localeCompare(
        a.submittedAt || a.updatedAt || "",
      ),
    );
  }, [allPredictions, users, query, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם טופס / משתמש..."
          className="w-full border border-border rounded-xl px-3 py-2 text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          {[
            { id: "all", label: "הכל" },
            { id: "submitted", label: "הוגשו" },
            { id: "pending", label: "ממתינים לאישור", count: pendingCount },
            { id: "draft", label: "טיוטות" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 ${
                statusFilter === f.id
                  ? "bg-primary text-white"
                  : "bg-bg-soft text-ink-muted"
              }`}
            >
              {f.label}
              {f.count != null && f.count > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-4 h-4 px-0.5 rounded-full text-3xs font-bold ${
                    statusFilter === f.id ? "bg-white text-primary" : "bg-primary text-white"
                  }`}
                >
                  {f.count > 9 ? "9+" : f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {rows.map((r) => (
          <div
            key={r.formId}
            className="card-duo-tight text-sm"
          >
            <div className="font-bold text-primary truncate">
              {r.formName || "ללא שם"}
            </div>
            <div className="text-xs text-ink-muted mt-0.5">
              {r.userName} · {r.status}
              {r.submittedAt &&
                ` · ${new Date(r.submittedAt).toLocaleDateString("he-IL")}`}
            </div>
            {r.adminNote && (
              <div
                className="text-xs text-accent-text mt-1 rounded-xl px-2 py-1"
                style={{ background: "var(--color-accent-soft)" }}
              >
                הערת מנהל: {r.adminNote}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setEditingId(r.formId)}
                className="btn-duo-flat"
              >
                עריכה
              </button>
              <button
                type="button"
                onClick={() => setTransferId(r.formId)}
                className="btn-duo-flat"
                style={{ background: "var(--color-secondary-soft, #E0F2FE)", color: "var(--color-secondary-dark)" }}
              >
                העבר בעלות
              </button>
              {r.status === "pending" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm(`לאשר את הטופס "${r.formName || "ללא שם"}"?`)) {
                      adminApprovePrediction(r.formId);
                      showToast("הטופס אושר");
                    }
                  }}
                  className="btn-duo-flat"
                  style={{ background: "var(--color-primary)", color: "#FFFFFF" }}
                >
                  ✅ אשר
                </button>
              )}
              {r.status === "draft" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm("להגיש את הטופס בשם המשתמש?")) {
                      adminForceSubmitForm(r.formId);
                      showToast("הטופס הוגש");
                    }
                  }}
                  className="btn-duo-flat"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary-dark)" }}
                >
                  הגשה כפויה
                </button>
              )}
              {(r.status === "submitted" || r.status === "approved") && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm("לפתוח מחדש כטיוטה")) {
                      adminReopenForm(r.formId);
                      showToast("הטופס נפתח מחדש");
                    }
                  }}
                  className="btn-duo-flat"
                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-text)" }}
                >
                  פתח מחדש
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (await confirm("למחוק טופס זה לצמיתות")) {
                    const ok = await adminDeleteForm(r.formId);
                    if (ok) showToast("הטופס נמחק");
                    else showToast("מחיקת הטופס נכשלה", "error");
                  }
                }}
                className="btn-duo-flat"
                style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
              >
                מחק
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-center text-ink-muted py-8 text-sm">אין תוצאות</p>
        )}
      </div>

      {editingId && allPredictions[editingId] && (
        <AdminFormEditModal
          key={`${editingId}-${allPredictions[editingId].updatedAt || ""}-${allPredictions[editingId].adminNote || ""}`}
          formId={editingId}
          form={allPredictions[editingId]}
          onClose={() => setEditingId(null)}
        />
      )}

      {transferId && allPredictions[transferId] && (
        <TransferOwnerModal
          formId={transferId}
          form={allPredictions[transferId]}
          users={users}
          onClose={() => setTransferId(null)}
        />
      )}
    </div>
  );
}
