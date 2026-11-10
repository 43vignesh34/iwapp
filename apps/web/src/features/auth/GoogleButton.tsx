import { useEffect, useRef } from 'react';

/** The bits of Google Identity Services we use (https://developers.google.com/identity/gsi/web). */
interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * Google's own "Sign in with Google" button. Google shows the account picker and hands us an
 * ID token (`credential`); we send it to the API, which verifies it (modules/auth/google.ts).
 * Loaded from Google's script, not an npm package. The CSP must allow accounts.google.com.
 */
export function GoogleButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = () => {
      const google = window.google;
      if (!google || !container.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => {
          onCredential(r.credential);
        },
      });
      google.accounts.id.renderButton(container.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 280,
      });
    };
    if (window.google) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = render;
    document.head.append(script);
  }, [clientId, onCredential]);

  return <div ref={container} />;
}
