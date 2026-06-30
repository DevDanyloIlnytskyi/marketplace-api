# 1C API Documentation — Results

**Date:** 2026-06-24  
**Status:** `1C_API_DOCUMENTATION_READY`

---

## Deliverables

| File | Status |
|------|--------|
| `docs/1C_API_DOCUMENTATION.md` | Created |
| `docs/1C_API_POSTMAN_COLLECTION_DRAFT.json` | Created |
| `project-context/results/1C_API_DOCUMENTATION_RESULTS.md` | Created |

---

## Source analysis

| Source | Used for |
|--------|----------|
| `api/routes/integration/index.js` | Route inventory, middleware, scopes |
| `api/integration/controllers/*` | Request/response adapters |
| `api/shared/integration/*` | Auth, idempotency, multipart, error codes |
| `api/shared/catalog/*` | Domain fields, validation codes |
| `api/shared/integration-sync/*` | Bulk sync job/chunk contract |
| `project-context/integration/openapi-integration-v1.yaml` | Cross-check schemas |
| `project-context/1C_json/integration-v1/*` | Response examples |
| `project-context/results/ONE_C_INTEGRATION_ARCHITECTURE.md` | Orders pull model |
| `project-context/results/ONE_C_QUICK_START.md` | Headers, scopes |
| `docs/PLATFORM_7_STAGE_2_RESULTS.md` | Multipart pipeline |

**Note:** `docs/ONE_C_INTEGRATION_ARCHITECTURE.md` and `docs/ONE_C_QUICK_START.md` not found at requested paths; used `project-context/results/` equivalents.

---

## Endpoint validation (code vs documentation)

All documented endpoints confirmed in `api/routes/integration/index.js`:

| Method | Path | Scope | In doc |
|--------|------|-------|--------|
| GET | `/health` | — | ✓ |
| GET | `/whoami` | auth | ✓ |
| GET | `/categories` | catalog.read | ✓ |
| GET | `/categories/:idBas` | catalog.read | clarification only |
| GET | `/products` | catalog.read | ✓ |
| GET | `/products/:idBas` | catalog.read | clarification only |
| PUT | `/products/:idBas` | catalog.write | ✓ |
| PUT | `/products/:productIdBas/media` | media.write | ✓ |
| GET | `/prices/:productIdBas` | prices.read | ✓ |
| PUT | `/prices/:productIdBas` | prices.write | ✓ |
| GET | `/stock/:productIdBas` | stock.read | ✓ |
| PUT | `/stock/:productIdBas` | stock.write | ✓ |
| GET | `/orders` | orders.read | ✓ |
| GET | `/orders/:id` | orders.read | ✓ |
| GET | `/catalog` | catalog.read | ✓ |
| POST | `/catalog/sync` | sync.write | ✓ |
| GET | `/catalog/sync/:jobId` | sync.read | ✓ |
| POST | `/catalog/sync/:jobId/chunks` | sync.write | ✓ |
| POST | `/catalog/sync/:jobId/resume` | sync.write | ✓ |
| POST | `/catalog/sync/:jobId/cancel` | sync.write | ✓ |
| GET | `/catalog/sync/:jobId/events` | sync.read | ✓ |

Not documented (intentionally):

| Method | Path | Reason |
|--------|------|--------|
| POST | `/debug/idempotency-test` | Debug only |

---

## Corrections vs outdated references

| Item | Old docs / spec drift | Actual code |
|------|----------------------|-------------|
| Chunk body field | `items` (BULK_SYNC_ARCHITECTURE) | `records` |
| Stock chunk max | 250 in some docs | 500 (`SYNC_STOCK_CHUNK_MAX`) |
| Create job response | `uploadUrl`, `recommendedBatchSizes` | Not returned by `mapJobToResponse` |
| Scope denied code | `SCOPE_DENIED` (task brief) | `INSUFFICIENT_SCOPE` |
| Chunk idempotency | sometimes implied required | No middleware on chunks route |
| Validation umbrella | `VALIDATION_ERROR` only | Domain codes also returned (e.g. `INVALID_PRODUCT_NAME`) |

---

## Postman collection

Draft v2.1.0 with 18 requests across 6 folders. Variables: `baseUrl`, `host`, `apiKey`, `idBas`, `categoryIdBas`, `jobId`, `idempotencyKey`.

Multipart file upload requests omitted from JSON draft (require manual file attach in Postman UI); covered in markdown curl examples.

---

## Blockers

None.

---

## Final status

**1C_API_DOCUMENTATION_READY**
