import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

// jsdom doesn't implement these browser APIs, which Mantine uses. Minimal stand-ins:
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
class ResizeObserverStub {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
}
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' }); // an unmocked call is a test bug (MSW 3 name)
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
