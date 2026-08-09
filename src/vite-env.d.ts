/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_LOCAL_TEST_MODE?: string;
  readonly VITE_CLOUD_SYNC_TEST_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
