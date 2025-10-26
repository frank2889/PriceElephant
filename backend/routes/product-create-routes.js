/**
 * Product Creation Endpoint
 * POST /api/v1/products/create
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// POST /api/v1/products/create - Create single product
router.post('/create', async (req, res) => {
  try {
    const {
      shopify_customer_id,
      product_name,
      product_ean,
      product_sku,
      brand,
      category,
      own_price,
      product_url,
      image_url,
      channable_product_id,
      active = true
    } = req.body;

    // Validate required fields
    if (!shopify_customer_id || !product_name) {
      return res.status(400).json({
        error: 'shopify_customer_id and product_name are required'
      });
    }

    // Check for duplicate by EAN
    if (product_ean) {
      const existing = await db('products')
        .where({ product_ean, shopify_customer_id })
        .first();

      if (existing) {
        return res.status(409).json({
          error: 'Product with this EAN already exists for this customer',
          product_id: existing.id
        });
      }
    }

    // Insert product
    const [product] = await db('products')
      .insert({
        shopify_customer_id,
        product_name,
        product_ean,
        product_sku,
        brand,
        category,
        own_price,
        product_url,
        image_url,
        channable_product_id,
        active
      })
      .returning('*');

    res.status(201).json({
      success: true,
      product
    });

  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

module.exports = router;
