import { useState, useMemo } from "react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUsers,
  useSettings,
  useActualBonuses,
} from "../hooks/useStore";
import { saveActualBonuses } from "../store";
import { useToast } from "../components/Toast";
import AdminResultsTab from "../components/AdminResultsTab";
import AdminSettingsTab from "../components/AdminSettingsTab";
import AdminUsersTab from "../components/AdminUsersTab";
import AdminDashboardTab from "../components/AdminDashboardTab";
import AdminFormsTab from "../components/AdminFormsTab";
import AdminToolsTab from "../components/AdminToolsTab";
import AdminSummariesTab from "../components/AdminSummariesTab";
import AdminQueryTab from "../components/adminQuery/AdminQueryTab";
import AdminInsightsTab from "../components/AdminInsightsTab";
import PlayerAutocomplete from "../components/PlayerAutocomplete";
import PageHeader from "../components/PageHeader";
import { isSamePlayer, getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";

export default function Admin() {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const settings = useSettings();
  const actualBonuses = useActualBonuses();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [topScorerInput, setTopScorerInput] = useState("");
  const showToast = useToast();

  const formsCount = useMemo(
    () => Object.keys(allPredictions).length,
    [allPredictions],
  );
  const usersCount = useMemo(
    () => Object.keys(users).length,
    [users],
  );
  const resultsCount = useMemo(
    () => Object.keys(results).length,
    [results],
  );

  const tabBadges = useMemo(() => ({
    forms: formsCount || null,
    users: usersCount || null,
    results: resultsCount || null,
  }), [formsCount, usersCount, resultsCount]);

  if (!user?.isAdmin) {
    return (
      <div className="text-center py-12 card-duo-lg max-w-md mx-auto">
        <div className="text-6xl mb-4">🔐</div>
        <h2 className="text-xl font-extrabold text-ink">נדרשת גישת מנהל</h2>
        <p className="text-ink-muted text-sm mt-2 font-medium">
          השחקן הראשון שמצטרף הופך למנהל.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="לוח ניהול" />

      <div
        className="flex gap-1 mb-4 bg-bg-soft rounded-2xl p-1 overflow-x-auto scroll-smooth border-2 border-border"
        style={{
          maskImage: 'linear-gradient(to left, transparent, black 24px, black calc(100% - 24px), transparent)',
          WebkitMaskImage: 'linear-gradient(to left, transparent, black 24px, black calc(100% - 24px), transparent)',
        }}
      >
        {[
          { id: "dashboard", label: "סקירה" },
          { id: "forms", label: "טפסים" },
          { id: "results", label: "תוצאות" },
          { id: "insights", label: "מידע ונתונים" },
          { id: "summaries", label: "בלוג" },
          { id: "topscorer", label: "מלך שערים" },
          { id: "users", label: "משתמשים" },
          { id: "tools", label: "כלים" },
          { id: "query", label: "שאילתות" },
          { id: "settings", label: "הגדרות" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3 py-2 text-xs font-extrabold rounded-xl transition border-none cursor-pointer ${
              activeTab === tab.id
                ? "bg-white text-primary"
                : "bg-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tabBadges[tab.id] != null && (
              <span className="mr-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-3xs font-extrabold rounded-full bg-primary text-white">
                {tabBadges[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <AdminDashboardTab
          settings={settings}
          users={users}
          allPredictions={allPredictions}
          results={results}
        />
      )}

      {activeTab === "forms" && (
        <AdminFormsTab users={users} allPredictions={allPredictions} />
      )}

      {activeTab === "results" && <AdminResultsTab />}

      {activeTab === "insights" && <AdminInsightsTab />}

      {activeTab === "summaries" && <AdminSummariesTab />}

      {activeTab === "tools" && <AdminToolsTab />}

      {activeTab === "query" && <AdminQueryTab />}

      {activeTab === "topscorer" && (
        <div className="space-y-4">
          <div className="card-duo">
            <h3 className="font-extrabold text-base text-ink mb-2">
              ⚽ מלך השערים
            </h3>
            <p className="text-xs text-ink-muted mb-3 font-medium">
              הוסף את כל השחקנים שנמצאים בראש טבלת הכובשים (במקרה של שוויון).
            </p>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <PlayerAutocomplete
                  value={topScorerInput}
                  onChange={(val) => setTopScorerInput(val)}
                />
              </div>
              <button
                onClick={() => {
                  const name = topScorerInput.trim();
                  if (!name) return;
                  const playerList = resolvePlayerList(settings.topScorerPlayers);
                  const current = actualBonuses.topScorers || [];
                  if (current.some((n) => isSamePlayer(n, name, playerList))) {
                    showToast(
                      `"${getPlayerDisplayName(name, playerList)}" כבר ברשימה`,
                      "error",
                    );
                    return;
                  }
                  saveActualBonuses({
                    ...actualBonuses,
                    topScorers: [...current, name],
                  });
                  setTopScorerInput("");
                }}
                className="btn-duo btn-duo-primary btn-duo-sm"
              >
                הוסף
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(actualBonuses.topScorers || []).map((name, i) => (
                <span
                  key={i}
                  className="bg-primary text-white px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-2"
                >
                  {getPlayerDisplayName(name, resolvePlayerList(settings.topScorerPlayers))}
                  <button
                    onClick={() => {
                      const updated = [...(actualBonuses.topScorers || [])];
                      updated.splice(i, 1);
                      saveActualBonuses({
                        ...actualBonuses,
                        topScorers: updated,
                      });
                    }}
                    className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-base leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <AdminSettingsTab
          settings={settings}
          users={users}
          allPredictions={allPredictions}
          results={results}
        />
      )}

      {activeTab === "users" && (
        <AdminUsersTab users={users} allPredictions={allPredictions} />
      )}
    </div>
  );
}
