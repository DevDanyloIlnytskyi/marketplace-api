/**
 * Opaque cursor helpers for integration list endpoints (Platform-5.2 foundation).
 * Payload: { id: number, sort?: string }
 */

/**
 * @param {{ id: number, sort?: string }} payload
 * @returns {string}
 */
function encodeCursor(payload) {
  if (!payload || typeof payload.id !== 'number' || !Number.isFinite(payload.id)) {
    throw new Error('encodeCursor requires numeric id');
  }
  const json = JSON.stringify({
    id: payload.id,
    sort: payload.sort || undefined,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * @param {string | undefined | null} cursor
 * @returns {{ id: number, sort?: string } | null}
 */
function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string' || !cursor.trim()) {
    return null;
  }

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.id !== 'number' || !Number.isFinite(parsed.id)) {
      return null;
    }
    return {
      id: parsed.id,
      sort: typeof parsed.sort === 'string' ? parsed.sort : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * @param {number} requested
 * @param {{ default?: number, max?: number }} [options]
 */
function clampLimit(requested, options = {}) {
  const defaultLimit = options.default ?? 50;
  const maxLimit = options.max ?? 200;
  const parsed = Number.parseInt(String(requested), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }
  return Math.min(parsed, maxLimit);
}

/**
 * Build standard pagination metadata from a fetched page.
 * @param {{ rows: Array<{ id: number }>, limit: number }} input
 */
function buildCursorPagination({ rows, limit }) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.length > 0 ? items[items.length - 1] : null;

  return {
    items,
    pagination: {
      next_cursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
      has_more: hasMore,
      limit,
    },
  };
}

module.exports = {
  encodeCursor,
  decodeCursor,
  clampLimit,
  buildCursorPagination,
};
