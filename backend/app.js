/**
 * Express application setup for PriceElephant backend
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');

const channableRoutes = require('./routes/channable-routes');
const shopifyRoutes = require('./routes/shopify-routes');
const productRoutes = require('./routes/product-routes');
const scraperRoutes = require('./routes/scraper-routes');
const variantRoutes = require('./routes/variant-routes');
const sitemapRoutes = require('./routes/sitemap-routes');
const customerRoutes = require('./routes/customer-routes');
const diagnosticRoutes = require('./routes/diagnostic-routes');

const app = express();

// Initialize background job queues
console.log('[App] Initializing background job queues...');
try {
  require('./jobs/sitemap-import-queue');
  console.log('[App] ✅ Sitemap import queue initialized');
} catch (error) {
  console.error('[App] ⚠️ Failed to initialize sitemap import queue:', error.message);
}

// Trust Railway proxy (for rate limiting and real IP detection)
// Use specific proxy count instead of 'true' for security
app.set('trust proxy', process.env.RAILWAY_ENVIRONMENT ? 1 : false);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use('/public', express.static('public'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

app.use('/api/v1/channable', channableRoutes);
app.use('/api/v1/shopify', shopifyRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/products', variantRoutes); // Variant management
app.use('/api/v1/scraper', scraperRoutes);
app.use('/api/v1/sitemap', sitemapRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/diagnostic', diagnosticRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    message: 'PriceElephant API v1',
    status: 'ready',
  });
});

module.exports = app;
