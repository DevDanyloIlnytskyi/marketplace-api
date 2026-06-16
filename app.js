const express = require('express');
const bodyparser = require('body-parser');
const passport = require('passport');
const autRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/category');
const productRoutes = require('./routes/products');
const propertiesRoutes = require('./routes/properties');
const products_propertiesRoutes = require('./routes/products_properties');
const products_photosRoutes = require('./routes/products_photos');
const products_priceRoutes = require('./routes/products_price');
const products_quantityRoutes = require('./routes/products_quantity');
const ordersRoutes = require('./routes/orders');
const baseInfoRoutes = require('./routes/base_info');
const catalogRoutes = require('./routes/catalog');
const paginate = require("express-paginate");

const tenantMiddleware = require('./shared/tenant/middleware');
const { tenantImagesMiddleware } = require('./shared/storage');

const app = express();
require('dotenv').config();

app.use(passport.initialize());
require('./middleware/passport')(passport);

app.use(require('morgan')(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/images', tenantImagesMiddleware);
app.use(require('cors')());
app.use(bodyparser.urlencoded({extended: false}));
app.use(bodyparser.json());
app.use(paginate.middleware(0, 10000000000000));
//app.use(express.json());

app.use('/api', tenantMiddleware);

/**
 * Mount the same route modules under legacy (/api) and versioned (/api/v1) prefixes.
 * Controllers are shared — no duplicated business logic.
 */
function mountApiRoutes(basePath) {
  app.use(`${basePath}/auth`, autRoutes);
  app.use(`${basePath}/category`, categoryRoutes);
  app.use(`${basePath}/product`, productRoutes);
  app.use(`${basePath}/properties`, propertiesRoutes);
  app.use(`${basePath}/products_properties`, products_propertiesRoutes);
  app.use(`${basePath}/products_photos`, products_photosRoutes);
  app.use(`${basePath}/products_price`, products_priceRoutes);
  app.use(`${basePath}/products_quantity`, products_quantityRoutes);
  app.use(`${basePath}/orders`, ordersRoutes);
  app.use(`${basePath}/base_info`, baseInfoRoutes);
  app.use(`${basePath}/catalog`, catalogRoutes);
}

mountApiRoutes('/api');
mountApiRoutes('/api/v1');

/** Platform-4.5.2+ — internal integration auth/scope tests (not /api/integration/*). */
app.use('/api/internal', require('./routes/internal'));

/** Platform-5.2 — Integration API read-only foundation (/api/integration/v1/*). */
app.use('/api/integration/v1', require('./routes/integration'));

module.exports = app;