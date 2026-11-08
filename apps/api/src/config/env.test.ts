import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

describe('loadEnv', () => {
  it('applies defaults when nothing is set', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 4000, HOST: '127.0.0.1' });
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

  it('accepts HOST=0.0.0.0, which containers need', () => {
    expect(loadEnv({ HOST: '0.0.0.0' }).HOST).toBe('0.0.0.0');
  });
});
