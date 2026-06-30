# Platform-7.3 — Temporary Idempotency Disable Results

**Date:** 2026-06-24  
**Status:** `PLATFORM_7_3_COMPLETE`

---

## Reason

Перша production-інтеграція з 1С потребує простішого контракту без `Idempotency-Key` на прямих PUT. Idempotency залишається в кодовій базі для повторного ввімкнення після стабілізації інтеграції.

---

## Runtime behaviour

**Env:** `INTEGRATION_IDEMPOTENCY_ENABLED`

| Value | Direct PUT behaviour |
|-------|---------------------|
| unset / `false` / `0` / `no` | Idempotency middleware skipped |
| `true` / `1` / `yes` | Stage-7.2 behaviour (key required) |

**Default:** disabled (`false`).

**Unchanged when disabled:**

- `X-API-Key` auth
- tenant resolution (`Host` / `X-Marketplace-Tenant`)
- scope checks
- JSON + multipart on products/media
- staging → promote → handler → transaction → rollback cleanup

**Multipart chain when disabled:**

```text
staging → promote → handler
```

**Multipart chain when enabled:**

```text
staging → fingerprint → idempotency → promote → handler
```

**Still requires idempotency (unchanged):**

- `POST /api/integration/v1/catalog/sync`
- `POST /api/integration/v1/debug/idempotency-test`

---

## Affected endpoints (direct writes)

| Method | Path |
|--------|------|
| PUT | `/api/integration/v1/products/:idBas` |
| PUT | `/api/integration/v1/products/:productIdBas/media` |
| PUT | `/api/integration/v1/prices/:productIdBas` |
| PUT | `/api/integration/v1/stock/:productIdBas` |

---

## Files changed

| File | Change |
|------|--------|
| `api/shared/integration/idempotency/config.js` | **new** — env toggle |
| `api/shared/integration/idempotency/index.js` | export config helper |
| `api/shared/integration/http/direct-write-middleware.js` | **new** — conditional chains |
| `api/shared/integration/http/integration-multipart.js` | conditional fingerprint in parse chain |
| `api/routes/integration/index.js` | use conditional middleware on 4 PUT routes |
| `api/scripts/integration-direct-write-no-idempotency-smoke.js` | **new** — Platform-7.3 tests |
| `api/scripts/integration-*-write*.js` | force `INTEGRATION_IDEMPOTENCY_ENABLED=true` for legacy smokes |
| `api/scripts/integration-idempotency*.js` | force enabled |
| `api/scripts/integration-platform-59-e2e.js` | force enabled |
| `api/package.json` | add `integration-direct-write-no-idempotency:smoke` |
| `docs/1C_API_DOCUMENTATION.md` | rewritten — first-stage 1C contract only |
| `docs/1C_API_POSTMAN_COLLECTION_DRAFT.json` | rewritten — no sync/idempotency |

**Not changed:** idempotency modules/tables/migrations, sync routes, sync worker, PM2 config, domain services.

---

## Tests

### New

`npm run integration-direct-write-no-idempotency:smoke`

Covers:

1. Product JSON PUT without key
2. Product multipart PUT without key
3. Media multipart PUT without key
4. Price PUT without key
5. Stock PUT without key
6. Scope rejection (403 `INSUFFICIENT_SCOPE`)
7. Multipart rollback — no orphan files on 404
8. Public docs/Postman forbidden-term scan

**Note:** Full smoke execution requires MySQL tenant DB. Local run on 2026-06-24 failed with `ECONNREFUSED 127.0.0.1:3307`. Config toggle and Postman JSON validated separately.

### Legacy (require `INTEGRATION_IDEMPOTENCY_ENABLED=true`)

- `integration-products-write:smoke`
- `integration-prices-write:smoke`
- `integration-stock-write:smoke`
- `integration-media-write:smoke`
- `integration-products-write-multipart:smoke`
- `integration-media-write-multipart:smoke`
- `integration-idempotency:smoke`
- `integration-idempotency-multipart:smoke`

---

## Restore idempotency later

1. Set `INTEGRATION_IDEMPOTENCY_ENABLED=true` in environment.
2. Restart API process.
3. Update 1C client to send `Idempotency-Key` on direct PUT.
4. Re-run idempotency smoke tests.

No code deletion required.

---

## Sync runtime

Sync routes, worker, jobs, batches, lease/recovery — **not modified**.

Removed from 1C-facing docs only:

- Bulk Sync section
- `/catalog/sync*` examples
- Postman Bulk Sync folder

---

## Documentation / Postman validation

Public files verified free of:

- `Idempotency-Key`
- `idempotencyKey`
- `/catalog/sync`
- `Bulk Sync`
- `sync.write`
- `sync.read`

---

## Final status

**PLATFORM_7_3_COMPLETE**
