/**
 * Diagnostic endpoint - check Shopify credentials and products
 * GET /api/v1/diagnostic
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/', async (req, res) => {
  try {
    // 1. Total products
    const totalResult = await db('products').count('* as count');
    const totalProducts = totalResult[0].count;
    
    // 2. Products by customer
    const byCustomer = await db('products')
      .select('shopify_customer_id')
      .groupBy('shopify_customer_id')
      .count('* as count');
    
    // 3. Customer config
    const config = await db('customer_configs')
      .where({ customer_id: '8557353828568' })
      .first();
    
    // 4. Recent products
    const recent = await db('products')
      .select('id', 'product_name', 'shopify_customer_id', 'shopify_product_id', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(10);
    
    res.json({
      success: true,
      data: {
        totalProducts,
        productsByCustomer: byCustomer,
        hoboConfig: {
          customerId: config?.customer_id || 'NOT FOUND',
          companyName: config?.company_name || 'N/A',
          shopifyDomain: config?.shopify_domain || 'NOT SET',
          hasAccessToken: !!config?.shopify_access_token,
          sitemapUrl: config?.sitemap_url || 'NOT SET'
        },
        recentProducts: recent.map(p => ({
          id: p.id,
          name: p.product_name,
          customerId: p.shopify_customer_id,
          hasShopifyId: !!p.shopify_product_id,
          createdAt: p.created_at
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
