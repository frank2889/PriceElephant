/**
 * Product Insights & Competitor Tracking Service
 * Provides product overviews, price history and manual competitor management
 */

require('dotenv').config();
const db = require('../config/database');

class ProductInsightsService {
  /**
   * Return paginated product overview with latest competitor data
   */
  static async getProductOverview(customerId, options = {}) {
    const {
      search,
      limit = 25,
      page = 1,
      sort = 'product_name',
      order = 'asc'
    } = options;

    const validatedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const validatedPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (validatedPage - 1) * validatedLimit;

    const sortableColumns = new Set([
      'product_name',
      'brand',
      'category',
      'own_price',
      'created_at'
    ]);
    const sortColumn = sortableColumns.has(sort) ? sort : 'product_name';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    // Base query for products
    const baseQuery = db('products')
      .where({ shopify_customer_id: customerId, active: true });

    if (search) {
      const term = `%${search}%`;
      baseQuery.andWhere((builder) => {
        builder
          .whereRaw('product_name ILIKE ?', [term])
          .orWhereRaw('product_ean ILIKE ?', [term])
          .orWhereRaw('product_sku ILIKE ?', [term])
          .orWhereRaw('brand ILIKE ?', [term]);
      });
    }

    const totalResult = await baseQuery.clone().count('* as count').first();
    const total = parseInt(totalResult?.count || 0, 10);

    const products = await baseQuery
      .clone()
      .select([
        'id',
        'shopify_product_id',
        'product_name',
        'product_ean',
        'product_sku',
        'brand',
        'category',
        'own_price',
        'product_url',
        'image_url',
        'channable_product_id',
        'created_at',
        'updated_at'
      ])
      .orderBy(sortColumn, sortOrder)
      .limit(validatedLimit)
      .offset(offset);

    if (products.length === 0) {
      return {
        pagination: {
          total,
          page: validatedPage,
          limit: validatedLimit,
          pages: Math.ceil(total / validatedLimit) || 1
        },
        products: []
      };
    }

    // Collect identifiers for price snapshot lookup in one query
    const shopifyProductIds = products
      .map((p) => p.shopify_product_id)
      .filter(Boolean);
    const productEans = products
      .map((p) => p.product_ean)
      .filter(Boolean);

    let snapshots = [];
    if (shopifyProductIds.length || productEans.length) {
      snapshots = await db('price_snapshots')
        .select([
          'shopify_product_id',
          'product_ean',
          'retailer',
          'price',
          'in_stock',
          'scraped_at'
        ])
        .where('shopify_customer_id', customerId)
        .andWhere((builder) => {
          if (shopifyProductIds.length) {
            builder.orWhereIn('shopify_product_id', shopifyProductIds);
          }
          if (productEans.length) {
            builder.orWhereIn('product_ean', productEans);
          }
        })
        .orderBy('scraped_at', 'desc');
    }

    const competitorMap = new Map();
    for (const snapshot of snapshots) {
      const key = snapshot.shopify_product_id
        ? `sid:${snapshot.shopify_product_id}`
        : `ean:${snapshot.product_ean}`;

      if (!key) continue;

      if (!competitorMap.has(key)) {
        competitorMap.set(key, new Map());
      }

      const retailerMap = competitorMap.get(key);
      if (!retailerMap.has(snapshot.retailer)) {
        retailerMap.set(snapshot.retailer, {
          retailer: snapshot.retailer,
          price: snapshot.price ? Number(snapshot.price) : null,
          inStock: snapshot.in_stock,
          scrapedAt: snapshot.scraped_at
        });
      }
    }

    const enriched = products.map((product) => {
      const mapKey = product.shopify_product_id
        ? `sid:${product.shopify_product_id}`
        : `ean:${product.product_ean}`;

      const competitors = Array.from(
        (competitorMap.get(mapKey) || new Map()).values()
      ).sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });

      const lowestCompetitor = competitors.find((c) => c.price !== null) || null;
      const ownPrice = product.own_price ? Number(product.own_price) : null;
      const priceDifference =
        lowestCompetitor && ownPrice !== null
          ? Number((ownPrice - lowestCompetitor.price).toFixed(2))
          : null;

      return {
        ...product,
        own_price: ownPrice,
        syncStatus: product.shopify_product_id ? 'synced' : 'pending',
        competitors,
        metrics: {
          competitorCount: competitors.length,
          inStockCount: competitors.filter((c) => c.inStock).length,
          lowestCompetitor,
          priceDifference,
          lastUpdated: competitors[0]?.scrapedAt || null
        }
      };
    });

    return {
      pagination: {
        total,
        page: validatedPage,
        limit: validatedLimit,
        pages: Math.ceil(total / validatedLimit) || 1
      },
      products: enriched
    };
  }

  /**
   * Get price history for a specific product
   */
  static async getPriceHistory(customerId, productId, options = {}) {
    const { retailer, days = 30 } = options;

    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      throw new Error('Product not found for this customer');
    }

    const historyQuery = db('price_snapshots')
      .select(['retailer', 'price', 'in_stock', 'scraped_at'])
      .where('shopify_customer_id', customerId);

    if (product.shopify_product_id) {
      historyQuery.andWhere('shopify_product_id', product.shopify_product_id);
    } else if (product.product_ean) {
      historyQuery.andWhere('product_ean', product.product_ean);
    } else {
      return {
        product: {
          id: product.id,
          product_name: product.product_name,
          own_price: product.own_price,
          shopify_product_id: product.shopify_product_id
        },
        history: [],
        stats: {}
      };
    }

    if (retailer) {
      historyQuery.andWhere('retailer', retailer);
    }

    const daysNumber = Math.max(parseInt(days, 10) || 30, 1);
    historyQuery.andWhere(
      'scraped_at',
      '>=',
      db.raw('CURRENT_TIMESTAMP - (? * INTERVAL \'1 day\')', [daysNumber])
    );

    const history = await historyQuery.orderBy('scraped_at', 'asc');

    const prices = history
      .map((row) => (row.price !== null ? Number(row.price) : null))
      .filter((value) => value !== null);

    const stats = {
      points: history.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      avgPrice: prices.length
        ? Number((prices.reduce((sum, val) => sum + val, 0) / prices.length).toFixed(2))
        : null,
      latestPrice: prices.length ? prices[prices.length - 1] : null,
      latestScrapedAt: history.length ? history[history.length - 1].scraped_at : null
    };

    return {
      product: {
        id: product.id,
        product_name: product.product_name,
        product_ean: product.product_ean,
        own_price: product.own_price ? Number(product.own_price) : null,
        shopify_product_id: product.shopify_product_id
      },
      history,
      stats
    };
  }

  /**
   * Retrieve manual competitor URLs for a product
   */
  static async getManualCompetitors(customerId, productId) {
    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      throw new Error('Product not found for this customer');
    }

    if (!product.shopify_product_id) {
      throw new Error('Product must be synced to Shopify before managing competitor URLs');
    }

    const competitors = await db('manual_competitor_urls')
      .where({
        shopify_customer_id: customerId,
        shopify_product_id: product.shopify_product_id,
        active: true
      })
      .orderBy('retailer', 'asc');

    const retailerNames = competitors.map((c) => c.retailer);
    const latestPrices = new Map();

    if (retailerNames.length) {
      const latestSnapshots = await db('price_snapshots')
        .select(['retailer', 'price', 'in_stock', 'scraped_at'])
        .where('shopify_customer_id', customerId)
        .modify((builder) => {
          if (product.shopify_product_id) {
            builder.where('shopify_product_id', product.shopify_product_id);
          } else if (product.product_ean) {
            builder.where('product_ean', product.product_ean);
          }
        })
        .whereIn('retailer', retailerNames)
        .orderBy('scraped_at', 'desc');

      for (const snapshot of latestSnapshots) {
        if (!latestPrices.has(snapshot.retailer)) {
          latestPrices.set(snapshot.retailer, {
            price: snapshot.price ? Number(snapshot.price) : null,
            inStock: snapshot.in_stock,
            scrapedAt: snapshot.scraped_at
          });
        }
      }
    }

    return {
      product: {
        id: product.id,
        product_name: product.product_name,
        shopify_product_id: product.shopify_product_id
      },
      manualCompetitors: competitors.map((item) => ({
        ...item,
        price_snapshot: latestPrices.get(item.retailer) || null
      }))
    };
  }

  /**
   * Add a manual competitor URL
   */
  static async addManualCompetitor(customerId, productId, payload) {
    const { retailer, competitorUrl } = payload;

    if (!retailer || !competitorUrl) {
      throw new Error('Retailer and competitorUrl are required');
    }

    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      throw new Error('Product not found for this customer');
    }

    if (!product.shopify_product_id) {
      throw new Error('Product must be synced to Shopify before adding competitor URLs');
    }

    const existing = await db('manual_competitor_urls')
      .where({
        shopify_customer_id: customerId,
        shopify_product_id: product.shopify_product_id,
        retailer
      })
      .first();

    if (existing) {
      throw new Error('A competitor URL already exists for this retailer');
    }

    const inserted = await db('manual_competitor_urls')
      .insert({
        shopify_customer_id: customerId,
        shopify_product_id: product.shopify_product_id,
        retailer,
        competitor_url: competitorUrl,
        active: true
      })
      .returning('id');

    const newId = Array.isArray(inserted)
      ? inserted[0]?.id ?? inserted[0]
      : inserted?.id ?? inserted;

    return {
      id: newId,
      retailer,
      competitor_url: competitorUrl
    };
  }

  /**
   * Update manual competitor URL
   */
  static async updateManualCompetitor(customerId, productId, competitorId, payload) {
    const { retailer, competitorUrl, active } = payload;

    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      throw new Error('Product not found for this customer');
    }

    if (!product.shopify_product_id) {
      throw new Error('Product must be synced to Shopify before updating competitor URLs');
    }

    const competitor = await db('manual_competitor_urls')
      .where({
        id: competitorId,
        shopify_customer_id: customerId,
        shopify_product_id: product.shopify_product_id
      })
      .first();

    if (!competitor) {
      throw new Error('Competitor URL not found');
    }

    const updatePayload = {
      retailer: retailer || competitor.retailer,
      competitor_url: competitorUrl || competitor.competitor_url
    };

    if (typeof active === 'boolean') {
      updatePayload.active = active;
    }

    await db('manual_competitor_urls')
      .where({ id: competitorId })
      .update(updatePayload);

    return { success: true };
  }

  /**
   * Soft-delete manual competitor URL
   */
  static async deleteManualCompetitor(customerId, productId, competitorId) {
    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      throw new Error('Product not found for this customer');
    }

    if (!product.shopify_product_id) {
      throw new Error('Product must be synced to Shopify before deleting competitor URLs');
    }

    const deleted = await db('manual_competitor_urls')
      .where({
        id: competitorId,
        shopify_customer_id: customerId,
        shopify_product_id: product.shopify_product_id
      })
      .update({ active: false });

    if (!deleted) {
      throw new Error('Competitor URL not found');
    }

    return { success: true };
  }
}

module.exports = ProductInsightsService;
