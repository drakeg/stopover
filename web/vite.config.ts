import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the same build works at a domain root, in a GitHub Pages
// subfolder (drakeg.github.io/stopover/), and inside the Capacitor phone apps.
export default defineConfig({
  base: './',
  plugins: [react()],
})
