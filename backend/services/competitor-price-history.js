/**
 * Competitor Price History Service
 * Tracks and analyzes competitor price changes over time
 */

const db = require('../config/database');

class CompetitorPriceHistory {
  /**
   * Record a price snapshot for a competitor
   * Automatically calculates price changes and detects events
   */
  async recordPrice(productId, retailer, competitorUrl, currentPrice, originalPrice = null, inStock = true) {
    try {
      // Get previous price for this competitor
      const previousPrice = await db('competitor_price_history')
        .where({ product_id: productId, retailer })
        .orderBy('recorded_at', 'desc')
        .first();

      // Calculate price change
      let priceChange = null;
      let priceChangePercent = null;
      
      if (previousPrice && previousPrice.price) {
        priceChange = currentPrice - parseFloat(previousPrice.price);
        priceChangePercent = (priceChange / parseFloat(previousPrice.price)) * 100;
      }

      // Detect if we're in a price event period
      const priceEvent = await this.detectPriceEvent();

      // Only record if price changed or it's been > 24 hours
      const shouldRecord = !previousPrice || 
                          priceChange !== 0 || 
                          (new Date() - new Date(previousPrice.recorded_at)) > 24 * 60 * 60 * 1000;

      if (shouldRecord) {
        await db('competitor_price_history').insert({
          product_id: productId,
          retailer,
          competitor_url: competitorUrl,
          price: currentPrice,
          original_price: originalPrice,
          price_change: priceChange,
          price_change_percent: priceChangePercent ? parseFloat(priceChangePercent.toFixed(2)) : null,
          in_stock: inStock,
          price_event: priceEvent,
          recorded_at: new Date()
        });

        console.log(`📊 Recorded price history: ${retailer} - €${currentPrice} (${priceChange ? (priceChange > 0 ? '+' : '') + priceChange.toFixed(2) : 'new'})`);
        
        return {
          recorded: true,
          priceChange,
          priceChangePercent,
          priceEvent
        };
      }

      return { recorded: false, reason: 'No significant change' };

    } catch (error) {
      console.error('❌ Error recording price history:', error.message);
      throw error;
    }
  }

  /**
   * Detect if current date is within a known price event
   */
  async detectPriceEvent() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Check if today is within 3 days of any event (before or after)
    const event = await db('price_events')
      .where('active', true)
      .whereRaw(`event_date BETWEEN ? AND ?`, [
        new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      ])
      .first();

    return event ? event.event_name : null;
  }

  /**
   * Get price history for a product's competitor
   */
  async getPriceHistory(productId, retailer, days = 365) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return await db('competitor_price_history')
      .where({ product_id: productId, retailer })
      .where('recorded_at', '>=', since)
      .orderBy('recorded_at', 'asc')
      .select('*');
  }

  /**
   * Get year-over-year comparison for a specific event
   */
  async getYearOverYearComparison(productId, retailer, eventName) {
    // Find all historical instances of this event
    const baseEventName = eventName.replace(/\s\d{4}$/, ''); // Remove year suffix
    
    const events = await db('price_events')
      .where('event_name', 'like', `${baseEventName}%`)
      .orderBy('event_date', 'desc');

    const comparisons = [];

    for (const event of events) {
      // Get price during this event (±3 days)
      const eventStart = new Date(event.event_date);
      eventStart.setDate(eventStart.getDate() - 3);
      const eventEnd = new Date(event.event_date);
      eventEnd.setDate(eventEnd.getDate() + 3);

      const priceData = await db('competitor_price_history')
        .where({ product_id: productId, retailer })
        .whereBetween('recorded_at', [eventStart, eventEnd])
        .orderBy('price', 'asc')
        .first(); // Lowest price during event

      if (priceData) {
        comparisons.push({
          year: event.event_year,
          event: event.event_name,
          eventDate: event.event_date,
          price: parseFloat(priceData.price),
          originalPrice: priceData.original_price ? parseFloat(priceData.original_price) : null,
          recordedAt: priceData.recorded_at
        });
      }
    }

    return comparisons;
  }

  /**
   * Get price trend analysis
   */
  async getPriceTrend(productId, retailer, days = 90) {
    const history = await this.getPriceHistory(productId, retailer, days);

    if (history.length < 2) {
      return { trend: 'insufficient_data', prices: history };
    }

    const prices = history.map(h => parseFloat(h.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 2];

    // Simple trend: comparing current to average
    let trend = 'stable';
    if (currentPrice > avgPrice * 1.05) trend = 'increasing';
    if (currentPrice < avgPrice * 0.95) trend = 'decreasing';

    return {
      trend,
      currentPrice,
      previousPrice,
      avgPrice: parseFloat(avgPrice.toFixed(2)),
      minPrice,
      maxPrice,
      priceRange: maxPrice - minPrice,
      volatility: ((maxPrice - minPrice) / avgPrice * 100).toFixed(2),
      dataPoints: history.length
    };
  }

  /**
   * Sync price history to Shopify metafield
   */
  async syncToShopifyMetafield(shopifyProductId, productId, shopifyIntegration) {
    try {
      // Get all competitors for this product
      const competitors = await db('competitor_prices')
        .where({ product_id: productId })
        .select('retailer', 'url');

      const historyData = {};

      for (const competitor of competitors) {
        const history = await this.getPriceHistory(productId, competitor.retailer, 365);
        const trend = await this.getPriceTrend(productId, competitor.retailer, 90);

        historyData[competitor.retailer] = {
          url: competitor.url,
          trend: trend.trend,
          currentPrice: trend.currentPrice,
          avgPrice: trend.avgPrice,
          minPrice: trend.minPrice,
          maxPrice: trend.maxPrice,
          history: history.slice(-50).map(h => ({ // Last 50 data points
            date: h.recorded_at,
            price: parseFloat(h.price),
            event: h.price_event
          }))
        };
      }

      // Update Shopify metafield
      await shopifyIntegration.addProductMetafield(
        shopifyProductId,
        'priceelephant',
        'price_history_analysis',
        JSON.stringify(historyData),
        'json'
      );

      console.log(`✅ Synced price history to Shopify for product ${shopifyProductId}`);

    } catch (error) {
      console.error('❌ Error syncing price history to Shopify:', error.message);
    }
  }
}

module.exports = new CompetitorPriceHistory();
