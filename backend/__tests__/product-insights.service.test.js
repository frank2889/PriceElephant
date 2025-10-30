const ProductInsightsService = require('../services/product-insights');
const {
  db,
  resetDatabase,
  createSubscription,
  createProduct,
  insertPriceSnapshot,
  unwrapId
} = require('../tests/db-utils');
const HybridScraper = require('../crawlers/hybrid-scraper');

const CUSTOMER_ID = 101;
const SHOPIFY_PRODUCT_ID = 900001;

describe('ProductInsightsService integration (manual competitors)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createSubscription({ customerId: CUSTOMER_ID, planName: 'starter' });
  });

  afterAll(async () => {
    await resetDatabase();
  });

  test('adds manual competitor and persists to database', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      ean: '8719327383001',
      ownPrice: 199.99,
      productName: 'Lenovo ThinkPad X1 Carbon Gen 11'
    });

    const result = await ProductInsightsService.addManualCompetitor(CUSTOMER_ID, productId, {
      retailer: 'coolblue',
      competitorUrl: 'https://www.coolblue.nl/product/123'
    });

    expect(result.retailer).toBe('coolblue');
    expect(result.competitor_url).toBe('https://www.coolblue.nl/product/123');

    const stored = await db('manual_competitor_urls')
      .where({ id: result.id })
      .first();

    expect(stored).toMatchObject({
      retailer: 'coolblue',
      competitor_url: 'https://www.coolblue.nl/product/123',
      active: true
    });
    expect(Number(stored.shopify_customer_id)).toBe(CUSTOMER_ID);
    expect(Number(stored.shopify_product_id)).toBe(SHOPIFY_PRODUCT_ID);
  });

  test('prevents duplicate manual competitor per retailer', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Samsung Odyssey G9'
    });

    await ProductInsightsService.addManualCompetitor(CUSTOMER_ID, productId, {
      retailer: 'bol.com',
      competitorUrl: 'https://www.bol.com/nl/nl/p/odyssey-g9'
    });

    await expect(
      ProductInsightsService.addManualCompetitor(CUSTOMER_ID, productId, {
        retailer: 'bol.com',
        competitorUrl: 'https://www.bol.com/nl/nl/p/odyssey-g9'
      })
    ).rejects.toThrow('A competitor URL already exists for this retailer');
  });

  test('returns latest price snapshot when fetching manual competitors', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      ean: '5397184591406',
      productName: 'Logitech MX Master 3S'
    });

    const competitorId = unwrapId(
      await db('manual_competitor_urls')
        .insert({
          shopify_customer_id: CUSTOMER_ID,
          shopify_product_id: SHOPIFY_PRODUCT_ID,
          retailer: 'mediamarkt',
          competitor_url: 'https://www.mediamarkt.nl/product/999',
          active: true
        })
        .returning('id')
    );

    await insertPriceSnapshot({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      retailer: 'mediamarkt',
      price: 87.5,
      inStock: true,
      scrapedAt: new Date('2025-10-25T10:00:00Z')
    });

    const result = await ProductInsightsService.getManualCompetitors(
      CUSTOMER_ID,
      productId
    );

    expect(result.product.id).toBe(productId);
    expect(result.manualCompetitors).toHaveLength(1);
  expect(result.manualCompetitors[0].id).toBe(competitorId);
    expect(result.manualCompetitors[0].price_snapshot).toMatchObject({
      price: 87.5,
      inStock: true
    });
  });

  test('updates manual competitor including active flag', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Dell XPS 15'
    });

    const competitorId = unwrapId(
      await db('manual_competitor_urls')
        .insert({
          shopify_customer_id: CUSTOMER_ID,
          shopify_product_id: SHOPIFY_PRODUCT_ID,
          retailer: 'alternate',
          competitor_url: 'https://www.alternate.nl/p/old',
          active: true
        })
        .returning('id')
    );

    await ProductInsightsService.updateManualCompetitor(
      CUSTOMER_ID,
      productId,
      competitorId,
      {
        competitorUrl: 'https://www.alternate.nl/p/new',
        active: false
      }
    );

    const updated = await db('manual_competitor_urls')
      .where({ id: competitorId })
      .first();

    expect(updated.competitor_url).toBe('https://www.alternate.nl/p/new');
    expect(updated.active).toBe(false);
  });

  test('soft deletes manual competitor', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID,
      productName: 'Apple MacBook Pro'
    });

    const competitorId = unwrapId(
      await db('manual_competitor_urls')
        .insert({
          shopify_customer_id: CUSTOMER_ID,
          shopify_product_id: SHOPIFY_PRODUCT_ID,
          retailer: 'coolblue',
          competitor_url: 'https://www.coolblue.nl/product/macbook-pro'
        })
        .returning('id')
    );

    const response = await ProductInsightsService.deleteManualCompetitor(
      CUSTOMER_ID,
      productId,
      competitorId
    );

    expect(response).toEqual({ success: true });

    const stored = await db('manual_competitor_urls')
      .where({ id: competitorId })
      .first();

    expect(stored.active).toBe(false);
  });

  test('throws when product does not belong to customer', async () => {
    const productId = await createProduct({
      customerId: CUSTOMER_ID,
      shopifyProductId: SHOPIFY_PRODUCT_ID
    });

    await expect(
      ProductInsightsService.addManualCompetitor(999, productId, {
        retailer: 'coolblue',
        competitorUrl: 'https://www.coolblue.nl/product/123'
      })
    ).rejects.toThrow('Product not found for this customer');
  });

  describe('syncManualCompetitor', () => {
    let scrapeSpy;

    beforeEach(() => {
      scrapeSpy = jest
        .spyOn(HybridScraper.prototype, 'scrapeProduct')
        .mockResolvedValue({
          price: 123.45,
          inStock: true,
          tier: 'direct',
          cost: 0,
          cacheHit: false
        });
      jest.spyOn(HybridScraper.prototype, 'close').mockResolvedValue();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('scrapes competitor URL and stores price snapshot', async () => {
      const productId = await createProduct({
        customerId: CUSTOMER_ID,
        shopifyProductId: SHOPIFY_PRODUCT_ID,
        productName: 'Sony WH-1000XM5',
        ean: '4548736130772'
      });

      const competitorId = unwrapId(
        await db('manual_competitor_urls')
          .insert({
            shopify_customer_id: CUSTOMER_ID,
            shopify_product_id: SHOPIFY_PRODUCT_ID,
            retailer: 'coolblue',
            competitor_url: 'https://www.coolblue.nl/product/sony'
          })
          .returning('id')
      );

      const result = await ProductInsightsService.syncManualCompetitor(
        CUSTOMER_ID,
        productId,
        competitorId
      );

      expect(scrapeSpy).toHaveBeenCalledWith(
        'https://www.coolblue.nl/product/sony',
        '4548736130772',
        'coolblue',
        null
      );

      expect(result.snapshot).toMatchObject({
        price: 123.45,
        inStock: true,
        method: 'direct'
      });

      const snapshot = await db('price_snapshots')
        .where({ shopify_customer_id: CUSTOMER_ID, retailer: 'coolblue' })
        .first();

      expect(snapshot).toBeTruthy();
      expect(Number(snapshot.price)).toBeCloseTo(123.45, 2);
      expect(snapshot.scraping_method).toBe('direct');
      expect(snapshot.metadata).toContain('manual-sync');
    });

    test('fails when competitor is inactive', async () => {
      const productId = await createProduct({
        customerId: CUSTOMER_ID,
        shopifyProductId: SHOPIFY_PRODUCT_ID,
        productName: 'Philips Hue'
      });

      const competitorId = unwrapId(
        await db('manual_competitor_urls')
          .insert({
            shopify_customer_id: CUSTOMER_ID,
            shopify_product_id: SHOPIFY_PRODUCT_ID,
            retailer: 'bol.com',
            competitor_url: 'https://www.bol.com/nl/p/philips-hue',
            active: false
          })
          .returning('id')
      );

      await expect(
        ProductInsightsService.syncManualCompetitor(CUSTOMER_ID, productId, competitorId)
      ).rejects.toThrow('Competitor URL is inactive');

      expect(scrapeSpy).not.toHaveBeenCalled();
    });

    test('fails when scraper returns invalid price', async () => {
      jest
        .spyOn(HybridScraper.prototype, 'scrapeProduct')
        .mockResolvedValueOnce({ price: null, inStock: true });

      const productId = await createProduct({
        customerId: CUSTOMER_ID,
        shopifyProductId: SHOPIFY_PRODUCT_ID,
        productName: 'Garmin Edge 1040'
      });

      const competitorId = unwrapId(
        await db('manual_competitor_urls')
          .insert({
            shopify_customer_id: CUSTOMER_ID,
            shopify_product_id: SHOPIFY_PRODUCT_ID,
            retailer: 'mediamarkt',
            competitor_url: 'https://www.mediamarkt.nl/product/garmin'
          })
          .returning('id')
      );

      await expect(
        ProductInsightsService.syncManualCompetitor(CUSTOMER_ID, productId, competitorId)
      ).rejects.toThrow('No price found during scraping');

      const snapshot = await db('price_snapshots')
        .where({ shopify_customer_id: CUSTOMER_ID, retailer: 'mediamarkt' })
        .first();

      expect(snapshot).toBeUndefined();
    });
  });
});
