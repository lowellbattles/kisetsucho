import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: the same build works at a sub-path (GitHub Pages:
  // lowellbattles.github.io/kisetsucho/) and at a domain root (Vercel etc.).
  // No router, so there are no deep links for relative paths to break.
  base: "./",
  server: {
    // Fixed port, and fail loudly if taken: ledger data is per-origin
    // (localStorage), so a silent port change would "hide" the user's data.
    port: 6173,
    strictPort: true,
  },
})
