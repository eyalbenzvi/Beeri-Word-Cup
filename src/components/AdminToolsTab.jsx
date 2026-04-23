import { useState } from "react";
import {
  useMatchResults,
  useAllPredictions,
  useUsers,
  useActualBonuses,
  useSettings,
} from "../hooks/useStore";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import Leaderboard from "../pages/Leaderboard";
import SimulatorPanel from "./SimulatorPanel";

function AdminExportReports({ leaderboard, users, allPredictions, playerList }) {
  const downloadCsv = () => {
    const header = "מקום,שם טופס,משתמש,תקציב,אלופה,מלך שערים,נקודות,מדויקים,הכרעות\n";
    const lines = leaderboard.map((e, i) => {
      const pred = allPredictions[e.formId] || {};
      const topScorerDisplay = pred.topScorer
        ? getPlayerDisplayName(pred.topScorer, playerList)
        : "";
      return [
        i + 1,
        `"${(e.formName || "").replace(/"/g, '""')}"`,
        `"${(e.userName || "").replace(/"/g, '""')}"`,
        `"${pred.budgetNumber || ""}"`,
        `"${pred.champion || ""}"`,
        `"${topScorerDisplay.replace(/"/g, '""')}"`,
        e.totalPoints,
        e.exactScoreCount,
        e.outcomeCount,
      ].join(",");
    });
    const blob = new Blob(["\uFEFF" + header + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPerUserJson = () => {
    const byUser = {};
    for (const [fid, p] of Object.entries(allPredictions)) {
      const uid = p.userId;
      if (!byUser[uid]) {
        byUser[uid] = {
          displayName: users[uid]?.displayName || uid,
          forms: [],
        };
      }
      byUser[uid].forms.push({ formId: fid, ...p });
    }
    const blob = new Blob([JSON.stringify(byUser, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictions-by-user-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          ייצוא טבלת דירוג (CSV)
        </h3>
        <p className="text-xs text-ink-muted mb-2">
          קובץ עם דירוג, שמות טפסים ונקודות — לפתיחה באקסל / גוגל שיטס
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          className="btn-duo btn-duo-primary w-full"
        >
          הורד CSV
        </button>
      </div>
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          סיכום ניחושים לפי משתמש (JSON)
        </h3>
        <button
          type="button"
          onClick={downloadPerUserJson}
          className="btn-duo btn-duo-ghost w-full"
          style={{ color: "var(--color-primary)", borderColor: "var(--color-primary)" }}
        >
          הורד JSON
        </button>
      </div>
      <div className="card-duo">
        <h3 className="font-extrabold text-base text-ink mb-2">
          הדפסה / שמירה כ-PDF
        </h3>
        <p className="text-xs text-ink-muted mb-2">
          יפתח חלון הדפסה — אפשר &quot;שמור כ-PDF&quot; בדפדפן
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-duo btn-duo-ghost w-full"
        >
          הדפס / PDF
        </button>
      </div>
    </div>
  );
}

export default function AdminToolsTab() {
  const [sub, setSub] = useState("preview");
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const playerList = resolvePlayerList(settings.topScorerPlayers);
  const { leaderboard } = useLeaderboardComputed(
    results,
    allPredictions,
    users,
    actualBonuses,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {[
          { id: "preview", label: "תצוגת דירוג" },
          { id: "sim", label: "סימולטור" },
          { id: "export", label: "ייצוא" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${
              sub === t.id
                ? "bg-primary text-white"
                : "bg-bg-soft text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "preview" && (
        <div className="admin-embed-leaderboard">
          <Leaderboard embedded forceUnlockView />
        </div>
      )}
      {sub === "sim" && <SimulatorPanel />}
      {sub === "export" && (
        <AdminExportReports
          leaderboard={leaderboard}
          users={users}
          allPredictions={allPredictions}
          playerList={playerList}
        />
      )}
    </div>
  );
}
