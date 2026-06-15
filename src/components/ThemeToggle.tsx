import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

// Light/dark switch. Lives in the header so it's reachable from every page,
// for both guests and signed-in users.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      className="tap-44 text-ink-muted bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-ink rounded-xl hover:bg-bg-soft inline-flex items-center justify-center"
      aria-label={dark ? "מצב בהיר" : "מצב כהה"}
      title={dark ? "מצב בהיר" : "מצב כהה"}
      aria-pressed={dark}
    >
      {dark ? <Sun size={22} aria-hidden="true" /> : <Moon size={22} aria-hidden="true" />}
    </button>
  );
}
