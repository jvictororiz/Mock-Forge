/// <reference types="vite/client" />

import type { MockForgeAPI } from '../shared/mockforge-api';

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    mockforge: MockForgeAPI;
  }
}

export {};
