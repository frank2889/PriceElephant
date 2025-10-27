const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * Get customer tier information
 * GET /api/v1/customers/:customerId/tier
 */
router.get('/:customerId/tier', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Fetch tier from database
    const tier = await db('customer_tiers')
      .where({ customer_id: customerId })
      .first();
    
    if (!tier) {
      // Default to trial if not found
      return res.json({
        tier: 'trial',
        product_limit: 50,
        competitor_limit: 5,
        api_access: false,
        monthly_price: 0
      });
    }
    
    res.json({
      tier: tier.tier,
      product_limit: tier.product_limit,
      competitor_limit: tier.competitor_limit,
      api_access: tier.api_access,
      monthly_price: parseFloat(tier.monthly_price)
    });
    
  } catch (error) {
    console.error('Error fetching customer tier:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer tier',
      message: error.message 
    });
  }
});

module.exports = router;
