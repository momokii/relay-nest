import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET
const apiProxy = apiProxyTarget
  ? {
      "/auth": { target: apiProxyTarget },
      "/admin": { target: apiProxyTarget },
      "/scoped": { target: apiProxyTarget },
      "/health": { target: apiProxyTarget },
    }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
