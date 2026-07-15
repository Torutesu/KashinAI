/// <reference types="vite/client" />

import type { KashinAiApi } from '../../shared/types'

declare global {
  interface Window {
    api: KashinAiApi
  }
}

export {}
