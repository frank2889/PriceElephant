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

const app = express();

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

app.use('/api/v1/channable', channableRoutes);
app.use('/api/v1/shopify', shopifyRoutes);
app.use('/api/v1/products', productRoutes);

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
