import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// 組織ルートサイト(alchemist-order.github.io)に移行したため base は常に root。
export default defineConfig({
  base: '/',
  plugins: [react()],
})
