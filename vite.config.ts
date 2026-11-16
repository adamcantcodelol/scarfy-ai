import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/scarfy-ai/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
})
