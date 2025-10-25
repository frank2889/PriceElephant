process.env.NODE_ENV = 'test';

const request = require('supertest');

const app = require('../app');
const {
  db,
  resetDatabase,
  createSubscription,
  createProduct,
  insertPriceSnapshot
} = require('../tests/db-utils');

const CUSTOMER_ID = 202;
const SHOPIFY_PRODUCT_ID = 880001;

describe('Product routes integration', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createSubscription({ customerId: CUSTOMER_ID, planName: 'starter' });
  });

  afterAll(async () => {
    await resetDatabase();
  });

  test('GET /api/v1/products/:customerId returns enriched overview', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Logitech MX Master 3S',
      ownPrice: 99.99,
      brand: 'Logitech',
      category: 'Accessories'
    });

    await insertPriceSnapshot({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      retailer: 'coolblue',
      price: 94.99,
      inStock: true
    });

    await insertPriceSnapshot({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      retailer: 'bol.com',
      price: 96.5,
      inStock: false
    });

    const res = await request(app).get(`/api/v1/products/${CUSTOMER_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].id).toBe(productId);
    expect(res.body.products[0].competitors).toHaveLength(2);
    expect(res.body.products[0].metrics.lowestCompetitor.price).toBeCloseTo(94.99);
  });

  test('GET /api/v1/products/:customerId/:productId/history returns timeline data', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Samsung Odyssey G9'
    });

    await insertPriceSnapshot({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      retailer: 'coolblue',
      price: 1299,
      scrapedAt: new Date('2025-10-24T09:00:00Z')
    });

    await insertPriceSnapshot({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      retailer: 'coolblue',
      price: 1275,
      scrapedAt: new Date('2025-10-25T09:00:00Z')
    });

    const res = await request(app)
      .get(`/api/v1/products/${CUSTOMER_ID}/${productId}/history`)
      .query({ retailer: 'coolblue', days: 7 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.history).toHaveLength(2);
    expect(res.body.stats.minPrice).toBe(1275);
    expect(res.body.stats.maxPrice).toBe(1299);
  });

  test('POST /competitors creates competitor entry', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Lenovo ThinkPad X1 Carbon'
    });

    const res = await request(app)
      .post(`/api/v1/products/${CUSTOMER_ID}/${productId}/competitors`)
      .send({
        retailer: 'coolblue',
        competitorUrl: 'https://www.coolblue.nl/product/thinkpad-x1'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.competitor.retailer).toBe('coolblue');

    const stored = await db('manual_competitor_urls')
      .where({ shopify_customer_id: CUSTOMER_ID })
      .first();

    expect(stored).toMatchObject({
      retailer: 'coolblue',
      competitor_url: 'https://www.coolblue.nl/product/thinkpad-x1'
    });
    expect(Number(stored.shopify_product_id)).toBe(SHOPIFY_PRODUCT_ID);
  });

  test('DELETE /competitors returns 404 when competitor missing', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Apple MacBook Air'
    });

    const res = await request(app).delete(
      `/api/v1/products/${CUSTOMER_ID}/${productId}/competitors/9999`
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Competitor URL not found/);
  });
});
