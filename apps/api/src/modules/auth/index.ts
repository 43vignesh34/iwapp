// Public surface of the auth module.
export { registerAuthentication } from './hooks.ts';
export { authRoutes } from './routes.ts';
export { signInWithVerifiedEmail, type Actor, type IssuedSession } from './service.ts';
export { setSessionCookies } from './cookies.ts';
export { secretKey } from './tokens.ts';
export { testIdpRoutes } from './test-idp.ts';
