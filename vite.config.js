import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed port, and fail loudly if taken: ledger data is per-origin
    // (localStorage), so a silent port change would "hide" the user's data.
    port: 6173,
    strictPort: true,
  },
})
