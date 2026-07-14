import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

export default defineConfig({
  base: process.env.VITE_PORTAL_ASSET_BASE || '/',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    tailwindcss(),
    react(),
  ],
})
