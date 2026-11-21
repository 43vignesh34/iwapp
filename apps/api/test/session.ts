import { CSRF_HEADER, SESSION_COOKIES } from '@iwapp/shared';
import type { App } from '../src/app.ts';

/** The three session cookies, as a browser would hold them. */
export interface CookieJar {
  access?: string;
  refresh?: string;
  csrf?: string;
}

type InjectResponse = Awaited<ReturnType<App['inject']>>;

/** Reads Set-Cookie headers into the jar. A cleared cookie (empty value) removes it. */
export function absorbCookies(jar: CookieJar, res: InjectResponse): CookieJar {
  const next = { ...jar };
  for (const c of res.cookies) {
    const key = (Object.keys(SESSION_COOKIES) as (keyof typeof SESSION_COOKIES)[]).find(
      (k) => SESSION_COOKIES[k] === c.name,
    );
    if (key) next[key] = c.value === '' ? undefined : c.value;
  }
  return next;
}

/** Signs in through the test identity provider (AUTH_TEST_MODE) and returns the cookie jar. */
export async function signIn(app: App, email: string): Promise<CookieJar> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/test-login',
    payload: { email },
  });
  if (res.statusCode !== 204)
    throw new Error(`test-login failed: ${String(res.statusCode)} ${res.body}`);
  return absorbCookies({}, res);
}

/** Request options carrying the jar's cookies, plus the CSRF header (as the web app sends it). */
export function withSession(jar: CookieJar, options: { csrf?: boolean } = {}) {
  const cookies: Record<string, string> = {};
  if (jar.access) cookies[SESSION_COOKIES.access] = jar.access;
  if (jar.refresh) cookies[SESSION_COOKIES.refresh] = jar.refresh;
  if (jar.csrf) cookies[SESSION_COOKIES.csrf] = jar.csrf;
  const headers: Record<string, string> = {};
  if (options.csrf !== false && jar.csrf) headers[CSRF_HEADER] = jar.csrf;
  return { cookies, headers };
}
