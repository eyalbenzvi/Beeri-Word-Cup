import { useNavigation } from "../hooks/useNavigation";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function Login() {
  const { navigate } = useNavigation();

  return (
    <div className="text-center max-w-md mx-auto">
      <div className="pt-6 pb-2 md:pt-10 md:pb-4">
        <div className="text-6xl mb-4">⚽</div>
        <img
          src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png"
          alt="בארי"
          className="h-12 w-auto object-contain mx-auto mb-3"
        />
        <h1 className="text-2xl font-extrabold text-primary mb-1 tracking-tight">
          ברוכים הבאים!
        </h1>
        <p className="text-ink-muted text-sm">
          טורניר הניחושים של בארי — מונדיאל 2026
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-border shadow-sm space-y-4 mt-6">
        <p className="text-sm text-ink-muted">
          נרשמים בשנייה עם Google — בלי סיסמה נפרדת
        </p>

        <GoogleSignInButton onSuccess={() => navigate("home")} />
      </div>
    </div>
  );
}
