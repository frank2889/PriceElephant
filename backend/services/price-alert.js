/**
 * Simple Price Alert Service - USP Feature
 * 
 * Real-time notifications for actionable insights:
 * - Price drops >5% → "Match now!"
 * - Competitor undercuts → "They're cheaper"
 * - Stock changes → "Opportunity!"
 * 
 * NO ML, NO volatility tracking, NO complexity
 * Just simple triggers that help customers take action
 */

const db = require('../config/database');

class PriceAlertService {
  constructor() {
    this.minPriceDropPercent = 5; // Only alert on >5% drops
    this.minUndercutAmount = 5; // Only alert if >€5 cheaper
  }

  /**
   * Analyze new price snapshot and generate alerts
   */
  async analyzePriceSnapshot(productId, clientId, retailer, newPrice, inStock) {
    const alerts = [];

    try {
      // Get product info
      const product = await db('products')
        .where({ id: productId })
        .first();

      if (!product) return alerts;

      // Get latest price from this retailer (before this scrape)
      const previousPrice = await db('competitor_prices')
        .where({ product_id: productId, retailer })
        .orderBy('scraped_at', 'desc')
        .first();

      // 1. PRICE DROP ALERT (>5%)
      if (previousPrice && previousPrice.price > 0) {
        const dropPercent = ((previousPrice.price - newPrice) / previousPrice.price) * 100;
        
        if (dropPercent >= this.minPriceDropPercent) {
          const alert = await this.createAlert({
            product_id: productId,
            client_id: clientId,
            alert_type: 'PRICE_DROP',
            severity: dropPercent >= 15 ? 'high' : 'medium',
            message: `${retailer} dropped price from €${previousPrice.price} to €${newPrice} (-${dropPercent.toFixed(1)}%)`,
            metadata: {
              retailer,
              old_price: previousPrice.price,
              new_price: newPrice,
              drop_percent: dropPercent
            }
          });
          alerts.push(alert);
        }
      }

      // 2. COMPETITOR UNDERCUT ALERT
      if (product.current_price && newPrice > 0) {
        const difference = product.current_price - newPrice;
        
        if (difference >= this.minUndercutAmount) {
          const alert = await this.createAlert({
            product_id: productId,
            client_id: clientId,
            alert_type: 'COMPETITOR_UNDERCUT',
            severity: 'high',
            message: `${retailer} is now €${difference.toFixed(2)} cheaper than you (€${newPrice} vs €${product.current_price})`,
            metadata: {
              retailer,
              competitor_price: newPrice,
              your_price: product.current_price,
              difference
            }
          });
          alerts.push(alert);
        }
      }

      // 3. STOCK STATUS CHANGE
      if (previousPrice && previousPrice.in_stock !== inStock) {
        const alert = await this.createAlert({
          product_id: productId,
          client_id: clientId,
          alert_type: inStock ? 'STOCK_IN' : 'STOCK_OUT',
          severity: 'medium',
          message: `${retailer} ${inStock ? 'back in stock' : 'out of stock'}${!inStock ? ' - opportunity to capture sales!' : ''}`,
          metadata: {
            retailer,
            in_stock: inStock,
            previous_stock: previousPrice.in_stock
          }
        });
        alerts.push(alert);
      }

      // 4. PRICING OPPORTUNITY (you're cheapest)
      if (product.current_price && newPrice > 0) {
        const margin = newPrice - product.current_price;
        
        if (margin >= 10) { // They're at least €10 more expensive
          const alert = await this.createAlert({
            product_id: productId,
            client_id: clientId,
            alert_type: 'OPPORTUNITY',
            severity: 'low',
            message: `You have lowest price! ${retailer} is €${margin.toFixed(2)} more expensive - could increase margin`,
            metadata: {
              retailer,
              competitor_price: newPrice,
              your_price: product.current_price,
              potential_increase: margin * 0.5 // Could increase by 50% of gap
            }
          });
          alerts.push(alert);
        }
      }

      // Send alerts (email/webhook)
      for (const alert of alerts) {
        await this.sendAlert(alert, clientId);
      }

      return alerts;

    } catch (error) {
      console.error('Alert analysis error:', error.message);
      return alerts;
    }
  }

  /**
   * Create and save alert
   */
  async createAlert(alertData) {
    const [alert] = await db('price_alerts').insert({
      ...alertData,
      active: true,
      created_at: new Date()
    }).returning('*');

    return alert;
  }

  /**
   * Send alert via Klaviyo (Email + SMS)
   */
  async sendAlert(alert, clientId) {
    try {
      // Get client info
      const client = await db('clients')
        .where({ id: clientId })
        .first();

      if (!client) return;

      // Send via Klaviyo
      if (process.env.KLAVIYO_API_KEY) {
        const axios = require('axios');

        // Trigger Klaviyo event
        const klaviyoData = {
          data: {
            type: 'event',
            attributes: {
              properties: {
                alert_type: alert.alert_type,
                severity: alert.severity,
                message: alert.message,
                metadata: alert.metadata
              },
              metric: {
                data: {
                  type: 'metric',
                  attributes: {
                    name: alert.severity === 'high' ? 'Price Alert - High Priority' : 'Price Alert'
                  }
                }
              },
              profile: {
                data: {
                  type: 'profile',
                  attributes: {
                    email: process.env.ALERT_EMAIL,
                    phone_number: process.env.ALERT_PHONE // Your mobile for SMS
                  }
                }
              }
            }
          }
        };

        await axios.post('https://a.klaviyo.com/api/events/', klaviyoData, {
          headers: {
            'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
            'Content-Type': 'application/json',
            'revision': '2024-10-15'
          }
        });

        const channel = alert.severity === 'high' ? '📱 SMS + Email' : '📧 Email';
        console.log(`${channel} via Klaviyo for ${client.name}:`, alert.message);
      } else {
        console.log(`📧 Alert for ${client.name}:`, alert.message);
      }

      // Update last_triggered
      await db('price_alerts')
        .where({ id: alert.id })
        .update({ last_triggered: new Date() });

    } catch (error) {
      console.error('Send alert error:', error.message);
    }
  }

  /**
   * Get unread alerts for client
   */
  async getUnreadAlerts(clientId) {
    return await db('price_alerts')
      .where({ client_id: clientId, active: true })
      .whereNull('last_triggered')
      .orderBy('created_at', 'desc')
      .limit(50);
  }
}

module.exports = PriceAlertService;
