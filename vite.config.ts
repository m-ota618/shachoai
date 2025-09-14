// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://script.google.com',
        changeOrigin: true,
        secure: true,
        /**
         * 例:
         *   本番URL: https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec
         *   開発時:  http://localhost:5173/api へPOST → 下の rewrite で /macros/s/.../exec に付け替え
         */
        rewrite: (path) => {
          // /api または /api?foo=bar → /macros/s/XXXX/exec?foo=bar
          return path.replace(
            /^\/api(?:\/)?/,
            '/macros/s/AKfycbxioU2zCgbHtjqE6MCaSz9GRIRjB6FnahveMtaRItpVv4-al-pmSqR5ASRgKuGOJbkE/exec'
          )
        },
      },
    },
  },
})
