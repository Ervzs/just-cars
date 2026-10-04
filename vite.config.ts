import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from https://ervzs.github.io/just-cars/
export default defineConfig({
  base: '/just-cars/',
  plugins: [react(), tailwindcss()],
})
