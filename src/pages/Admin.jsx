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
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-lg font-bold text-gray-700">נדרשת גישת מנהל</h2>
        <p className="text-gray-500 text-sm mt-2">
          השחקן הראשון שמצטרף הופך למנהל.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚙️ לוח ניהול</h1>
      <div
        className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 overflow-x-auto scroll-smooth"
        style={{
          maskImage: 'linear-gradient(to left, transparent, black 24px, black calc(100% - 24px), transparent)',
          WebkitMaskImage: 'linear-gradient(to left, transparent, black 24px, black calc(100% - 24px), transparent)',
        }}
      >
        {[
          { id: "dashboard", label: "סקירה" },
          { id: "forms", label: "טפסים" },
          { id: "results", label: "תוצאות" },
          { id: "topscorer", label: "מלך שערים" },
          { id: "users", label: "משתמשים" },
          { id: "tools", label: "כלים" },
          { id: "settings", label: "הגדרות" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-2 py-2 text-xs font-medium rounded-md transition ${
              activeTab === tab.id
                ? "bg-white text-primary shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tabBadges[tab.id] != null && (
              <span className="mr-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-primary/15 text-primary">
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

      {activeTab === "tools" && <AdminToolsTab />}

      {activeTab === "topscorer" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="font-bold text-sm text-primary mb-2">
              ⚽ מלך השערים
            </h3>
            <p className="text-xs text-gray-400 mb-2">
              הוסף את כל השחקנים שנמצאים בראש טבלת הכובשים (במקרה של שוויון).
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={topScorerInput}
                onChange={(e) => setTopScorerInput(e.target.value)}
                placeholder="שם שחקן..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              <button
                onClick={() => {
                  if (!topScorerInput.trim()) return;
                  const current = actualBonuses.topScorers || [];
                  const name = topScorerInput.trim();
                  if (current.some(n => n.toLowerCase() === name.toLowerCase())) {
                    showToast(`"${name}" כבר ברשימה`, "error");
                    return;
                  }
                  saveActualBonuses({
                    ...actualBonuses,
                    topScorers: [...current, name],
                  });
                  setTopScorerInput("");
                }}
                className="bg-primary text-white px-3 py-2 rounded-lg text-sm"
              >
                הוסף
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(actualBonuses.topScorers || []).map((name, i) => (
                <span
                  key={i}
                  className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs flex items-center gap-1"
                >
                  {name}
                  <button
                    onClick={() => {
                      const updated = [...(actualBonuses.topScorers || [])];
                      updated.splice(i, 1);
                      saveActualBonuses({
                        ...actualBonuses,
                        topScorers: updated,
                      });
                    }}
                    className="text-green-500 hover:text-red-500"
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
