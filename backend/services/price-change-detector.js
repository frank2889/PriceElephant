/**
 * Price Change Detector
 * 
 * Detects significant price changes and triggers alerts
 * 
 * Features:
 * - Compare new vs previous price snapshots
 * - Calculate percentage change
 * - Store price history
 * - Trigger email alerts (for Starter+ plans)
 */

const db = require('../config/database');
const EventEmitter = require('events');

class PriceChangeDetector extends EventEmitter {
  constructor() {
    super();
    this.significantChangeThreshold = 5; // 5% price change triggers alert
  }

  /**
   * Detect price changes for a product across all retailers
   * @param {number} productId - Product ID
   * @returns {Array} Array of detected changes
   */
  async detectChanges(productId) {
    console.log(`[PriceChangeDetector] Checking product ${productId}`);
    
    const product = await db('products')
      .where({ id: productId })
      .first();
    
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    
    // Get all retailers for this product
    const competitors = await db('manual_competitor_urls')
      .where({ product_id: productId })
      .select('retailer');
    
    const changes = [];
    
    for (const competitor of competitors) {
      const change = await this.detectRetailerChange(productId, competitor.retailer);
      if (change) {
        changes.push(change);
      }
    }
    
    return changes;
  }

  /**
   * Detect price change for a specific retailer
   * @param {number} productId - Product ID
   * @param {string} retailer - Retailer name
   * @returns {Object|null} Change details or null if no significant change
   */
  async detectRetailerChange(productId, retailer) {
    // Get last two snapshots
    const snapshots = await db('price_snapshots')
      .where({ product_id: productId, retailer })
      .orderBy('scraped_at', 'desc')
      .limit(2);
    
    if (snapshots.length < 2) {
      console.log(`[PriceChangeDetector] Not enough data for ${retailer}`);
      return null;
    }
    
    const [current, previous] = snapshots;
    
    // Calculate change
    const priceDiff = current.price - previous.price;
    const percentageChange = ((priceDiff / previous.price) * 100);
    
    const isSignificant = Math.abs(percentageChange) >= this.significantChangeThreshold;
    
    if (!isSignificant) {
      console.log(`[PriceChangeDetector] ${retailer}: €${previous.price} → €${current.price} (${percentageChange.toFixed(1)}%) - not significant`);
      return null;
    }
    
    const changeType = priceDiff > 0 ? 'increase' : 'decrease';
    
    console.log(`[PriceChangeDetector] ${retailer}: €${previous.price} → €${current.price} (${percentageChange.toFixed(1)}%) - ${changeType.toUpperCase()}`);
    
    const change = {
      productId,
      retailer,
      previousPrice: previous.price,
      currentPrice: current.price,
      priceDiff,
      percentageChange,
      changeType,
      previousScrapedAt: previous.scraped_at,
      currentScrapedAt: current.scraped_at,
      inStock: current.in_stock
    };
    
    // Store in price history
    await this.storePriceHistory(change);
    
    // Emit event for alerting
    this.emit('priceChange', change);
    
    return change;
  }

  /**
   * Store price change in database
   * @param {Object} change - Change details
   */
  async storePriceHistory(change) {
    await db('price_snapshots')
      .where({ 
        product_id: change.productId, 
        id: await this.getCurrentSnapshotId(change.productId, change.retailer)
      })
      .update({
        price_changed: true,
        price_change_percentage: change.percentageChange,
        updated_at: new Date()
      });
    
    console.log(`[PriceChangeDetector] Stored price history for product ${change.productId}`);
  }

  /**
   * Get current snapshot ID
   */
  async getCurrentSnapshotId(productId, retailer) {
    const snapshot = await db('price_snapshots')
      .where({ product_id: productId, retailer })
      .orderBy('scraped_at', 'desc')
      .first();
    
    return snapshot ? snapshot.id : null;
  }

  /**
   * Get price history for a product
   * @param {number} productId - Product ID
   * @param {number} days - Number of days to look back (default: 30)
   * @returns {Array} Price history
   */
  async getPriceHistory(productId, days = 30) {
    const history = await db('price_snapshots')
      .where({ product_id: productId })
      .where('scraped_at', '>', db.raw(`NOW() - INTERVAL '${days} days'`))
      .orderBy('scraped_at', 'asc');
    
    // Group by retailer
    const grouped = {};
    history.forEach(snapshot => {
      if (!grouped[snapshot.retailer]) {
        grouped[snapshot.retailer] = [];
      }
      grouped[snapshot.retailer].push({
        price: snapshot.price,
        inStock: snapshot.in_stock,
        scrapedAt: snapshot.scraped_at,
        priceChanged: snapshot.price_changed,
        percentageChange: snapshot.price_change_percentage
      });
    });
    
    return grouped;
  }

  /**
   * Get best price across all retailers
   * @param {number} productId - Product ID
   * @returns {Object} Best price info
   */
  async getBestPrice(productId) {
    const latestPrices = await db('price_snapshots')
      .where({ product_id: productId, in_stock: true })
      .whereIn('id', function() {
        this.select(db.raw('MAX(id)'))
          .from('price_snapshots')
          .where('product_id', productId)
          .groupBy('retailer');
      })
      .orderBy('price', 'asc');
    
    if (latestPrices.length === 0) {
      return null;
    }
    
    const best = latestPrices[0];
    const own = await db('products')
      .where({ id: productId })
      .select('own_price')
      .first();
    
    return {
      retailer: best.retailer,
      price: best.price,
      ownPrice: own ? own.own_price : null,
      savings: own ? (own.own_price - best.price) : null,
      savingsPercentage: own && own.own_price > 0 ? ((own.own_price - best.price) / own.own_price * 100) : null,
      scrapedAt: best.scraped_at
    };
  }

  /**
   * Check if price is competitive (within 10% of best price)
   * @param {number} productId - Product ID
   * @returns {Object} Competitive analysis
   */
  async checkCompetitiveness(productId) {
    const product = await db('products')
      .where({ id: productId })
      .first();
    
    if (!product || !product.own_price) {
      return { competitive: null, reason: 'No own price set' };
    }
    
    const bestPrice = await this.getBestPrice(productId);
    
    if (!bestPrice) {
      return { competitive: null, reason: 'No competitor data' };
    }
    
    const diff = product.own_price - bestPrice.price;
    const diffPercentage = (diff / bestPrice.price * 100);
    
    const competitive = diffPercentage <= 10; // Within 10% = competitive
    
    return {
      competitive,
      ownPrice: product.own_price,
      bestCompetitorPrice: bestPrice.price,
      difference: diff,
      differencePercentage: diffPercentage,
      bestRetailer: bestPrice.retailer,
      recommendation: competitive 
        ? 'Your price is competitive' 
        : `Consider lowering price by €${Math.abs(diff).toFixed(2)} to match ${bestPrice.retailer}`
    };
  }
}

module.exports = PriceChangeDetector;
