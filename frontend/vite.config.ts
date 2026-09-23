import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Allows this dev server to be reached through a Cloudflare Quick
    // Tunnel (random *.trycloudflare.com hostname) for client demos --
    // Vite's allowedHosts guard otherwise 403s any unrecognized Host header.
    allowedHosts: [".trycloudflare.com"],
  },
})
