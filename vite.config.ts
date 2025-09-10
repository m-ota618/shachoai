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
        // あなたの /exec が https://script.google.com/macros/s/XXXXX/exec なら XXXXX を入れる
        rewrite: () => '/macros/s/19s5Ts-tpSIjXTOKYXNbvNsEXJXMEjRdsYoW6cbfdo4u-loukH5pWn5hj/exec',
      }
    }
  }
})