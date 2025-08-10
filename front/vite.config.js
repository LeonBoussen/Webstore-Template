import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  base: '/subfolder/ecom-dev',
  server: {
    allowedHosts: ['372c99871fbf.ngrok-free.app', 'localhost']
  }  
})
