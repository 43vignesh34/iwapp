import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp, type App } from './app.ts';
import { loadEnv } from './config/env.ts';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appFor(nodeEnv: 'test' | 'production' = 'test') {
  app = await buildApp(loadEnv({ NODE_ENV: nodeEnv }));
  return app;
}

describe('GET /healthz', () => {
  it('returns 200 { status: "ok" }', async () => {
    const res = await (await appFor()).inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('sends security headers', async () => {
    const res = await (await appFor()).inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('request IDs', () => {
  it('echoes a safe incoming x-request-id', async () => {
    const res = await (
      await appFor()
    ).inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('replaces an unsafe x-request-id with a generated one', async () => {
    const res = await (
      await appFor()
    ).inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'evil\nfake log line' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('RFC 9457 problem responses', () => {
  it('returns a 404 problem for an unknown route', async () => {
    const res = await (await appFor()).inject({ method: 'GET', url: '/nope?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Route GET /nope not found',
      requestId: res.headers['x-request-id'],
    });
  });

  it('returns a 400 VALIDATION_FAILED problem listing the bad fields', async () => {
    const a = await appFor();
    a.post(
      '/__test/echo',
      { schema: { body: z.object({ name: z.string().min(1) }) } },
      (req) => req.body,
    );
    const res = await a.inject({ method: 'POST', url: '/__test/echo', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ path: '/name' }],
    });
  });

  it('returns a 500 problem that leaks nothing from the error', async () => {
    const a = await appFor();
    a.get('/__test/boom', () => {
      throw new Error('connection to db-internal:5432 failed for user ravi@example.com');
    });
    const res = await a.inject({ method: 'GET', url: '/__test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(res.body).not.toMatch(/db-internal|ravi|example\.com/);
  });

  it('maps a Fastify client error (malformed JSON) to a problem', async () => {
    const a = await appFor();
    a.post('/__test/echo', (req) => req.body);
    const res = await a.inject({
      method: 'POST',
      url: '/__test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });
});

describe('/docs', () => {
  it('serves Swagger UI and an OpenAPI 3.1 document outside production', async () => {
    const a = await appFor('test');
    const ui = await a.inject({ method: 'GET', url: '/docs' });
    expect(ui.statusCode).toBe(200);
    const doc = await a.inject({ method: 'GET', url: '/docs/json' });
    expect(doc.json()).toMatchObject({ openapi: '3.1.0' });
  });

  it('keeps operational endpoints out of the OpenAPI contract', async () => {
    const doc = await (await appFor('test')).inject({ method: 'GET', url: '/docs/json' });
    expect(Object.keys(doc.json<{ paths?: object }>().paths ?? {})).not.toContain('/healthz');
  });

  it('does not exist in production', async () => {
    const a = await appFor('production');
    expect((await a.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
    expect((await a.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
  });
});
