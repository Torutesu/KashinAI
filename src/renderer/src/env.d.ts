/// <reference types="vite/client" />

import type { ContextAssistantApi } from '../../shared/types'

declare global {
  interface Window {
    api: ContextAssistantApi
  }
}

export {}
