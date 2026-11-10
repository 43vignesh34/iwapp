import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED, loggerOptions } from './logger.ts';

/** Builds a real Pino logger with our options and captures what it writes. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { log: pino(loggerOptions('info'), stream), lines };
}

describe('log redaction', () => {
  it('redacts top-level personal data', () => {
    const { log, lines } = capture();
    log.info({ phoneE164: '+919876543210', email: 'radha@example.com', dob: '1990-01-01' }, 'x');
    expect(lines[0]).toMatchObject({ phoneE164: REDACTED, email: REDACTED, dob: REDACTED });
  });

  it('redacts personal data nested one and two levels down', () => {
    const { log, lines } = capture();
    log.info({ member: { email: 'a@b.c', profile: { notes: 'private note' } } }, 'x');
    const out = JSON.stringify(lines[0]);
    expect(out).not.toContain('a@b.c');
    expect(out).not.toContain('private note');
  });

  it('redacts tokens and credential headers', () => {
    const { log, lines } = capture();
    log.info(
      { refreshToken: 'r1', headers: { cookie: 'access=abc', 'x-csrf-token': 'csrf1' } },
      'x',
    );
    const out = JSON.stringify(lines[0]);
    for (const secret of ['r1', 'access=abc', 'csrf1']) expect(out).not.toContain(secret);
  });

  it('keeps non-sensitive fields readable', () => {
    const { log, lines } = capture();
    log.info({ personId: 'p-1', status: 'active' }, 'x');
    expect(lines[0]).toMatchObject({ personId: 'p-1', status: 'active' });
  });
});
