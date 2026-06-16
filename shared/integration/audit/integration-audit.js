const crypto = require('crypto');

const { createLog } = require('./repository');

const TRACKING_FLAG = '_integrationAuditTrackingAttached';

/**
 * Resolve client IP without logging proxy chains verbatim beyond first hop.
 * @param {import('express').Request} req
 */
function resolveClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  const ip = req.ip || req.socket?.remoteAddress || null;
  return ip ? String(ip).slice(0, 45) : null;
}

/**
 * @param {import('express').Request} req
 */
function resolveRequestSize(req) {
  const raw = req.get('content-length');
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {import('express').Response} res
 */
function resolveResponseSize(res) {
  const raw = res.get('Content-Length') || res.get('content-length');
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {import('express').Response} res
 */
function resolveErrorCode(req, res) {
  if (res.locals.integrationErrorCode) {
    return String(res.locals.integrationErrorCode);
  }
  const status = res.statusCode;
  if (status >= 500) {
    return 'INTERNAL_ERROR';
  }
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function scheduleAsyncLogWrite(req, res) {
  if (!req.models || !req.tenant || !req.integrationAudit) {
    return;
  }

  const audit = req.integrationAudit;
  const durationMs = Math.max(0, Date.now() - audit.startedAt);
  const statusCode = res.statusCode;
  const success = statusCode >= 200 && statusCode < 400;

  setImmediate(() => {
    createLog(req.models, {
      tenantId: req.tenant.id,
      apiKeyId:
        req.integration?.keyId ??
        audit.apiKeyId ??
        null,
      requestId: audit.requestId,
      method: req.method,
      path: audit.path,
      statusCode,
      success,
      clientIp: audit.clientIp,
      userAgent: audit.userAgent,
      durationMs,
      requestSize: audit.requestSize,
      responseSize: resolveResponseSize(res),
      errorCode: success ? null : resolveErrorCode(req, res),
    }).catch((error) => {
      console.error('[integration-audit] createLog failed', {
        tenant: req.tenant?.id,
        requestId: audit.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

/**
 * Register finish listener and request_id — idempotent.
 * Called at the start of integrationAuth so 401/403 responses are still logged.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function attachIntegrationAuditTracking(req, res) {
  if (req[TRACKING_FLAG]) {
    return;
  }
  req[TRACKING_FLAG] = true;

  const requestId = req.requestId || crypto.randomUUID();
  if (!req.requestId) {
    req.requestId = requestId;
  }
  req.integrationAudit = {
    requestId,
    startedAt: Date.now(),
    path: req.originalUrl || req.url || req.path,
    clientIp: resolveClientIp(req),
    userAgent: String(req.get('user-agent') || '').slice(0, 512) || null,
    requestSize: resolveRequestSize(req),
    apiKeyId: null,
  };

  if (!res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', requestId);
  }
  res.on('finish', () => scheduleAsyncLogWrite(req, res));
}

/**
 * Record partial key identity for failed auth after hash lookup (no plaintext).
 * @param {import('express').Request} req
 * @param {string | null | undefined} apiKeyId
 */
function setIntegrationAuditKeyId(req, apiKeyId) {
  if (!req.integrationAudit || !apiKeyId) {
    return;
  }
  req.integrationAudit.apiKeyId = apiKeyId;
}

/**
 * Runs after integrationAuth + requireScopes, before controller.
 * Enriches audit context; finish handler already registered in integrationAuth.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function integrationAudit(req, res, next) {
  if (req.integration?.keyId) {
    setIntegrationAuditKeyId(req, req.integration.keyId);
  }
  return next();
}

module.exports = {
  attachIntegrationAuditTracking,
  setIntegrationAuditKeyId,
  integrationAudit,
  scheduleAsyncLogWrite,
};
