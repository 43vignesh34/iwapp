import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadEnv } from '../config/env.ts';
import { REDACTED } from './logger.ts';

// In production the HTTP instrumentation opens the request span. app.inject() skips the network,
// so here we open a span ourselves and run the request inside it, then inspect what was recorded.
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
});
afterAll(() => {
  context.disable();
  trace.disable();
});

async function spanFor(url: string) {
  exporter.reset();
  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }));
  const span = trace.getTracer('test').startSpan('GET');
  // The `await` must be INSIDE the callback. inject() returns a lazy thenable that only sends the
  // request when awaited; `() => app.inject(...)` would await it outside the span's context.
  await context.with(trace.setSpan(context.active(), span), async () => {
    await app.inject({ method: 'GET', url });
  });
  span.end();
  await app.close();
  const [recorded] = exporter.getFinishedSpans();
  if (!recorded) throw new Error('no span recorded');
  return recorded;
}

describe('request span telemetry', () => {
  it('names the span after the route pattern', async () => {
    const span = await spanFor('/healthz');
    expect(span.name).toBe('GET /healthz');
    expect(span.attributes['http.route']).toBe('/healthz');
  });

  it('never records the query string, which can hold personal data', async () => {
    const span = await spanFor('/api/v1/members?q=9876543210');
    expect(span.attributes['url.query']).toBe(REDACTED);
    expect(JSON.stringify(span.attributes)).not.toContain('9876543210');
  });
});
