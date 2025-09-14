import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // フロント(5173) → 関数(3000) へ中継（開発時）
      '/api': {
        target: 'http://localhost:3000', // vercel dev のサーバ
        changeOrigin: true,
        // rewrite は不要。/api/gas → /api/gas のまま通す
      },
    },
  },
})
