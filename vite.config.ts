import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Environment variables the browser app may read (import.meta.env.<NAME>).
 * They are read from .env locally or from the build environment (e.g. Vercel project settings)
 * and built into the client JavaScript, so anyone can see them: never add a secret here
 * (such as a Supabase service-role key). Only the names listed are exposed.
 */
const CLIENT_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'RESET_PASSWORD'] as const

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // '' = load every variable (not just VITE_*), from .env files and the process environment
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: Object.fromEntries(
      CLIENT_ENV.map(name => [`import.meta.env.${name}`, JSON.stringify(env[name] ?? '')])
    ),
    server: {
      host: true,
      port: 3000,
      open: true
    }
  }
})
