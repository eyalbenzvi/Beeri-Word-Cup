import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // מייצר source maps ציבוריים לצד ה-JS הממוזער. נחוץ כדי ש-Sentry
    // יוכל להציג stack traces קריאים (אחרת רואים רק שמות פונקציות ממוזערים).
    // היתרון: debug אמיתי בייצור. המחיר: הקוד המקורי נגיש דרך ה-CDN (בפרויקט
    // הזה אין סודות בקוד — כל המפתחות הרגישים חיים כ-env vars בשרת).
    sourcemap: true,
  },
})
