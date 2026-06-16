const express = require('express');
const { integrationAuth } = require('../../shared/integration/auth');
const { integrationAudit } = require('../../shared/integration/audit');
const { requireScopes, INTEGRATION_SCOPES } = require('../../shared/integration/scopes');
const {
  integrationRequestId,
  integrationErrorHandler,
  asyncHandler,
} = require('../../shared/integration/http');
const { integrationIdempotency } = require('../../shared/integration/idempotency');

const metaController = require('../../integration/controllers/meta');
const debugIdempotencyController = require('../../integration/controllers/debug-idempotency-test');
const categoriesController = require('../../integration/controllers/categories');
const productsController = require('../../integration/controllers/products');
const productsWriteController = require('../../integration/controllers/products-write');
const pricesController = require('../../integration/controllers/prices');
const pricesWriteController = require('../../integration/controllers/prices-write');
const stockController = require('../../integration/controllers/stock');
const stockWriteController = require('../../integration/controllers/stock-write');
const mediaWriteController = require('../../integration/controllers/media-write');
const ordersController = require('../../integration/controllers/orders');
const catalogController = require('../../integration/controllers/catalog');
const catalogSyncController = require('../../integration/controllers/catalog-sync');

const router = express.Router();

router.use(integrationRequestId);

router.get('/health', asyncHandler(metaController.getHealth));

const authedRouter = express.Router();
authedRouter.use(integrationAuth);
authedRouter.use(integrationAudit);

authedRouter.get('/whoami', asyncHandler(metaController.getWhoami));

authedRouter.post(
  '/debug/idempotency-test',
  integrationIdempotency({ required: true }),
  asyncHandler(debugIdempotencyController.postIdempotencyTest),
);

authedRouter.get(
  '/categories',
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  asyncHandler(categoriesController.listCategories),
);
authedRouter.get(
  '/categories/:idBas',
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  asyncHandler(categoriesController.getCategoryByIdBas),
);

authedRouter.get(
  '/products',
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  asyncHandler(productsController.listProducts),
);
authedRouter.get(
  '/products/:idBas',
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  asyncHandler(productsController.getProductByIdBas),
);
authedRouter.put(
  '/products/:idBas',
  requireScopes(INTEGRATION_SCOPES.CATALOG_WRITE),
  integrationIdempotency({ required: true }),
  asyncHandler(productsWriteController.upsertProductHandler),
);
authedRouter.put(
  '/products/:productIdBas/media',
  requireScopes(INTEGRATION_SCOPES.MEDIA_WRITE),
  integrationIdempotency({ required: true }),
  asyncHandler(mediaWriteController.replacePhotoSetHandler),
);

authedRouter.get(
  '/prices/:productIdBas',
  requireScopes(INTEGRATION_SCOPES.PRICES_READ),
  asyncHandler(pricesController.getPriceByProductIdBas),
);
authedRouter.put(
  '/prices/:productIdBas',
  requireScopes(INTEGRATION_SCOPES.PRICES_WRITE),
  integrationIdempotency({ required: true }),
  asyncHandler(pricesWriteController.upsertPriceHandler),
);

authedRouter.get(
  '/stock/:productIdBas',
  requireScopes(INTEGRATION_SCOPES.STOCK_READ),
  asyncHandler(stockController.getStockByProductIdBas),
);
authedRouter.put(
  '/stock/:productIdBas',
  requireScopes(INTEGRATION_SCOPES.STOCK_WRITE),
  integrationIdempotency({ required: true }),
  asyncHandler(stockWriteController.upsertStockHandler),
);

authedRouter.get(
  '/orders',
  requireScopes(INTEGRATION_SCOPES.ORDERS_READ),
  asyncHandler(ordersController.listOrders),
);
authedRouter.get(
  '/orders/:id',
  requireScopes(INTEGRATION_SCOPES.ORDERS_READ),
  asyncHandler(ordersController.getOrderById),
);

authedRouter.get(
  '/catalog',
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  asyncHandler(catalogController.getCatalog),
);

authedRouter.post(
  '/catalog/sync',
  requireScopes(INTEGRATION_SCOPES.SYNC_WRITE),
  integrationIdempotency({ required: true }),
  asyncHandler(catalogSyncController.createCatalogSyncJob),
);
authedRouter.get(
  '/catalog/sync/:jobId',
  requireScopes(INTEGRATION_SCOPES.SYNC_READ),
  asyncHandler(catalogSyncController.getCatalogSyncJob),
);
authedRouter.post(
  '/catalog/sync/:jobId/resume',
  requireScopes(INTEGRATION_SCOPES.SYNC_WRITE),
  asyncHandler(catalogSyncController.resumeCatalogSyncJob),
);
authedRouter.post(
  '/catalog/sync/:jobId/cancel',
  requireScopes(INTEGRATION_SCOPES.SYNC_WRITE),
  asyncHandler(catalogSyncController.cancelCatalogSyncJob),
);
authedRouter.get(
  '/catalog/sync/:jobId/events',
  requireScopes(INTEGRATION_SCOPES.SYNC_READ),
  asyncHandler(catalogSyncController.listCatalogSyncJobEvents),
);
authedRouter.post(
  '/catalog/sync/:jobId/chunks',
  requireScopes(INTEGRATION_SCOPES.SYNC_WRITE),
  asyncHandler(catalogSyncController.uploadCatalogSyncChunk),
);

router.use(authedRouter);
router.use(integrationErrorHandler);

module.exports = router;
