/// <reference types="vite/client" />

// Exposed to the app by vite.config.ts (CLIENT_ENV); set them in .env or the hosting provider
interface ImportMetaEnv {
  readonly SUPABASE_URL: string
  readonly SUPABASE_ANON_KEY: string
  readonly ADMIN_USERNAME: string
  readonly ADMIN_PASSWORD: string
  readonly RESET_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
