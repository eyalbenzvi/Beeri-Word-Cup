import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // מייצר source maps ציבוריים לצד ה-JS הממוזער כדי ש-Sentry יציג
    // stack traces קריאים. הקוד המקורי נגיש דרך ה-CDN — אין סודות בקוד,
    // כל המפתחות הרגישים חיים כ-env vars בשרת.
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase';
        },
      },
    },
  },
})
