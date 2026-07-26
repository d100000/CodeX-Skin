import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host,
    port: 5173,
    strictPort: true,
    hmr: process.env.TAURI_DEV_HOST
      ? { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 5174 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] }
  }
});
