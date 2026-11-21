/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID. Not a secret: Google's button needs it in the browser. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** 'true' shows the test-account sign-in in a production build (e2e/CI only). */
  readonly VITE_TEST_SIGN_IN?: string;
}
