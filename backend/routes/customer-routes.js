const express = require('express');
const router = express.Router();
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

const shopifyIntegration = new ShopifyIntegration();

/**
 * Get customer tier information
 * GET /api/v1/customers/:customerId/tier
 */
router.get('/:customerId/tier', async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log('[Customer Tier API] Request for customer:', customerId);
    
    const numericCustomerId = Number(customerId);
    const resolvedCustomerId = Number.isFinite(numericCustomerId) ? numericCustomerId : customerId;

    // Fetch tier from database as baseline
    let tierRecord = await db('customer_tiers')
      .where({ customer_id: resolvedCustomerId })
      .first();

    console.log('[Customer Tier API] Database result:', tierRecord);

    let source = tierRecord ? 'database' : 'default';

    try {
      const metafields = await shopifyIntegration.getCustomerTierMetafields(customerId);
      if (metafields?.tier) {
        console.log('[Customer Tier API] Shopify metafields found:', metafields);
        source = 'shopify';

        const fallbackTier = tierRecord?.tier || 'trial';
        const fallbackProductLimit = tierRecord?.product_limit ?? 50;
        const fallbackCompetitorLimit = tierRecord?.competitor_limit ?? 5;
        const fallbackApiAccess = tierRecord?.api_access ?? false;
        const fallbackMonthlyPrice = tierRecord?.monthly_price ?? 0;

        const normalizedTier = String(metafields.tier || fallbackTier).toLowerCase();

        const parseInteger = (value, fallback) => {
          if (value === null || value === undefined || value === '') {
            return fallback;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };

        const parseBoolean = (value, fallback) => {
          if (value === null || value === undefined) {
            return fallback;
          }
          const normalized = String(value).toLowerCase();
          if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
            return true;
          }
          if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
            return false;
          }
          return fallback;
        };

        const parseDecimal = (value, fallback) => {
          if (value === null || value === undefined || value === '') {
            return fallback;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };

        const normalizedRecord = {
          customer_id: resolvedCustomerId,
          tier: normalizedTier,
          product_limit: parseInteger(metafields.product_limit, fallbackProductLimit),
          competitor_limit: parseInteger(metafields.competitor_limit, fallbackCompetitorLimit),
          api_access: parseBoolean(metafields.api_access, fallbackApiAccess),
          monthly_price: parseDecimal(metafields.monthly_price, fallbackMonthlyPrice),
          updated_at: new Date()
        };

        await db('customer_tiers')
          .insert({
            customer_id: normalizedRecord.customer_id,
            tier: normalizedRecord.tier,
            product_limit: normalizedRecord.product_limit,
            competitor_limit: normalizedRecord.competitor_limit,
            api_access: normalizedRecord.api_access,
            monthly_price: normalizedRecord.monthly_price,
            updated_at: normalizedRecord.updated_at
          })
          .onConflict('customer_id')
          .merge({
            tier: normalizedRecord.tier,
            product_limit: normalizedRecord.product_limit,
            competitor_limit: normalizedRecord.competitor_limit,
            api_access: normalizedRecord.api_access,
            monthly_price: normalizedRecord.monthly_price,
            updated_at: normalizedRecord.updated_at
          });

        tierRecord = {
          ...normalizedRecord
        };
      }
    } catch (shopifyError) {
      console.log('[Customer Tier API] Shopify metafield lookup failed:', shopifyError.message);
    }

    if (!tierRecord) {
      console.log('[Customer Tier API] No tier found anywhere, returning trial defaults');
      return res.json({
        tier: 'trial',
        product_limit: 50,
        competitor_limit: 5,
        api_access: false,
        monthly_price: 0,
        source
      });
    }

    const monthlyPriceNumber = Number(tierRecord.monthly_price);
    const resolvedMonthlyPrice = Number.isFinite(monthlyPriceNumber) ? monthlyPriceNumber : 0;

    const response = {
      tier: tierRecord.tier,
      product_limit: tierRecord.product_limit,
      competitor_limit: tierRecord.competitor_limit,
      api_access: Boolean(tierRecord.api_access),
      monthly_price: resolvedMonthlyPrice,
      source
    };
    
    console.log('[Customer Tier API] ✅ Returning tier data:', response);
    res.json(response);
    
  } catch (error) {
    console.error('[Customer Tier API] ❌ Error:', error.message);
    console.error('[Customer Tier API] Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch customer tier',
      message: error.message 
    });
  }
});

module.exports = router;
