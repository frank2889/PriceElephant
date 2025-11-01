const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Clear orphaned Shopify product IDs for a customer
router.post('/clear-orphaned-shopify-ids/:customerId', async (req, res) => {
  const { customerId } = req.params;
  
  try {
    console.log(`🧹 Clearing orphaned Shopify IDs for customer ${customerId}...`);
    
    const result = await db('products')
      .where('customer_id', customerId)
      .whereNotNull('shopify_product_id')
      .update({
        shopify_product_id: null,
        updated_at: new Date()
      });
    
    console.log(`✅ Cleared ${result} orphaned Shopify product IDs`);
    
    res.json({
      success: true,
      clearedCount: result,
      message: `Cleared ${result} orphaned Shopify product IDs for customer ${customerId}`
    });
  } catch (error) {
    console.error('❌ Error clearing orphaned IDs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
