import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgres://iwapp:iwapp@localhost:5433/iwapp',
      JWT_SECRET: 'insecure-local-development-jwt-secret-not-for-prod',
      AUTH_TEST_MODE: false,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('coerces PORT from a string to a number', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it.each(['abc', '0', '65536', '3000.5', ''])('rejects PORT=%j', (port) => {
    expect(() => loadEnv({ PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  const PROD = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@db.internal/iwapp',
    JWT_SECRET: 'x'.repeat(32),
    GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com',
  };

  it('accepts a complete production environment', () => {
    expect(loadEnv(PROD).AUTH_TEST_MODE).toBe(false);
  });

  it('REFUSES to start in production with AUTH_TEST_MODE on', () => {
    expect(() => loadEnv({ ...PROD, AUTH_TEST_MODE: 'true' })).toThrow(/AUTH_TEST_MODE/);
  });

  it('requires a JWT_SECRET of at least 32 characters in production', () => {
    expect(() => loadEnv({ ...PROD, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...PROD, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => loadEnv({ ...PROD, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
  });

  it('accepts HOST=0.0.0.0, which containers need', () => {
    expect(loadEnv({ HOST: '0.0.0.0' }).HOST).toBe('0.0.0.0');
  });
});
