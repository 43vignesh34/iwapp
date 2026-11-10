import { AppError } from '../../errors.ts';

/**
 * Cursors are opaque to clients: base64url of the last row's sort key. Clients just pass back
 * `nextCursor`. If we change the sort order later, old cursors fail cleanly with 400.
 */
export function encodeCursor(row: { legalName: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.legalName, row.id])).toString('base64url');
}

export function decodeCursor(cursor: string): { legalName: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      /^[0-9a-f-]{36}$/.test(parsed[1])
    ) {
      return { legalName: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw new AppError('invalid', 'INVALID_CURSOR', 'Invalid cursor.');
}
