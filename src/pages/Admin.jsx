import { useState } from "react";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUsers,
  useSettings,
  useActualBonuses,
} from "../hooks/useStore";
import { saveActualBonuses } from "../store";
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
  const [adminPin, setAdminPin] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [topScorerInput, setTopScorerInput] = useState("");

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

  if (!pinVerified && activeTab === "settings") {
    const currentPin = settings.adminPin || "1234";
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔑</div>
        <h2 className="text-lg font-bold text-gray-700 mb-4">הכנס קוד מנהל</h2>
        <p className="text-xs text-gray-400 mb-3">קוד ברירת מחדל: 1234</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adminPin === currentPin) setPinVerified(true);
          }}
        >
          <input
            type="password"
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            placeholder="PIN"
            className="w-32 px-4 py-2 border-2 border-gray-200 rounded-xl text-center text-lg tracking-widest focus:border-primary focus:outline-none mb-3"
            autoFocus
          />
          <br />
          <button
            type="submit"
            className="bg-primary text-white font-semibold px-6 py-2 rounded-xl hover:bg-primary-light transition"
          >
            אימות
          </button>
        </form>
        <button
          onClick={() => setActiveTab("results")}
          className="mt-3 text-sm text-gray-400 hover:text-primary"
        >
          חזרה →
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-primary mb-4">⚙️ לוח ניהול</h1>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 overflow-x-auto">
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
                  saveActualBonuses({
                    ...actualBonuses,
                    topScorers: [...current, topScorerInput.trim()],
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
