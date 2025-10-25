const db = require('../config/database');

const TABLES_TO_TRUNCATE = [
  'price_snapshots',
  'manual_competitor_urls',
  'products',
  'product_customers',
  'scrape_jobs',
  'subscriptions',
  'channable_integrations',
  'email_notifications',
  'price_alerts',
  'api_keys',
  'audit_logs',
  'ai_predictions',
  'system_metrics'
];

const unwrapId = (insertResult) => {
  if (Array.isArray(insertResult)) {
    const value = insertResult[0];
    if (value && typeof value === 'object') {
      return value.id ?? value;
    }
    return value;
  }

  if (insertResult && typeof insertResult === 'object') {
    return insertResult.id ?? insertResult;
  }

  return insertResult;
};

async function resetDatabase() {
  if (!TABLES_TO_TRUNCATE.length) {
    return;
  }

  const tables = TABLES_TO_TRUNCATE.join(', ');
  await db.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

async function createSubscription({
  customerId,
  planName = 'starter',
  status = 'active',
  trialEndsAt = null,
  currentPeriodEnd = null
}) {
  const plan = await db('subscription_plans').where({ name: planName }).first();
  if (!plan) {
    throw new Error(`Subscription plan not found: ${planName}`);
  }

  const inserted = await db('subscriptions')
    .insert({
      shopify_customer_id: customerId,
      plan_id: plan.id,
      status,
      trial_ends_at: trialEndsAt,
      current_period_end: currentPeriodEnd
    })
    .returning('id');

  return unwrapId(inserted);
}

async function createProduct({
  customerId,
  shopifyProductId = null,
  ean = null,
  sku = null,
  brand = null,
  category = null,
  ownPrice = null,
  url = null,
  imageUrl = null,
  channableId = null,
  productName = 'Test Product'
}) {
  const inserted = await db('products')
    .insert({
      shopify_customer_id: customerId,
      shopify_product_id: shopifyProductId,
      product_name: productName,
      product_ean: ean,
      product_sku: sku,
      brand,
      category,
      own_price: ownPrice,
      product_url: url,
      image_url: imageUrl,
      channable_product_id: channableId,
      active: true
    })
    .returning('id');

  return unwrapId(inserted);
}

async function insertPriceSnapshot({
  customerId,
  shopifyProductId = null,
  productEan = null,
  retailer,
  price = null,
  inStock = true,
  scrapedAt = new Date()
}) {
  const inserted = await db('price_snapshots')
    .insert({
      shopify_customer_id: customerId,
      shopify_product_id: shopifyProductId,
      product_ean: productEan,
      retailer,
      price,
      in_stock: inStock,
      scraped_at: scrapedAt
    })
    .returning('id');

  return unwrapId(inserted);
}

module.exports = {
  db,
  resetDatabase,
  createSubscription,
  createProduct,
  insertPriceSnapshot,
  unwrapId
};
