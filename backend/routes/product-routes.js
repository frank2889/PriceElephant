const express = require('express');
const ProductInsightsService = require('../services/product-insights');
const db = require('../config/database');
const { groupProducts, createShopifyVariants } = require('../utils/variant-grouping');

const router = express.Router();

// POST /api/v1/products/import - Bulk import products with variant detection
router.post('/import', async (req, res) => {
  try {
    const { products, enable_variant_grouping = true } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        error: 'products array is required and must not be empty'
      });
    }

    const results = {
      imported: 0,
      skipped: 0,
      failed: 0,
      variants_created: 0,
      parent_products: 0,
      errors: []
    };

    // Group products by customer to process each customer's products separately
    const productsByCustomer = {};
    for (const product of products) {
      const customerId = product.shopify_customer_id;
      if (!productsByCustomer[customerId]) {
        productsByCustomer[customerId] = [];
      }
      productsByCustomer[customerId].push(product);
    }

    // Process each customer's products
    for (const [customerId, customerProducts] of Object.entries(productsByCustomer)) {
      try {
        if (enable_variant_grouping) {
          // Group products by variants
          const grouped = groupProducts(customerProducts);
          
          for (const group of grouped) {
            try {
              // Check if parent product already exists
              const parentEan = group.variants[0].product_ean;
              let parentProduct = null;
              
              if (parentEan) {
                parentProduct = await db('products')
                  .where({ 
                    product_ean: parentEan,
                    shopify_customer_id: customerId 
                  })
                  .first();
              }

              // If only one variant, import as standalone product
              if (group.variants.length === 1) {
                if (parentProduct) {
                  results.skipped++;
                  continue;
                }

                await db('products').insert({
                  shopify_customer_id: customerId,
                  product_name: group.variants[0].product_name,
                  product_ean: group.variants[0].product_ean,
                  product_sku: group.variants[0].product_sku,
                  brand: group.brand,
                  category: group.variants[0].category,
                  own_price: group.variants[0].own_price,
                  product_url: group.variants[0].product_url,
                  image_url: group.variants[0].image_url,
                  channable_product_id: group.variants[0].channable_product_id,
                  active: group.variants[0].active !== undefined ? group.variants[0].active : true,
                  is_parent_product: true
                });

                results.imported++;
                continue;
              }

              // Multiple variants - create parent and variants
              if (parentProduct) {
                results.skipped += group.variants.length;
                continue;
              }

              // Create Shopify variant structure
              const shopifyStructure = createShopifyVariants(group);
              
              // Insert parent product (first variant)
              const firstVariant = group.variants[0];
              const variantInfo = firstVariant.variantInfo;
              
              const [parent] = await db('products')
                .insert({
                  shopify_customer_id: customerId,
                  product_name: group.baseName,
                  product_ean: firstVariant.product_ean,
                  product_sku: firstVariant.product_sku,
                  brand: group.brand,
                  category: firstVariant.category,
                  own_price: firstVariant.own_price,
                  product_url: firstVariant.product_url,
                  image_url: firstVariant.image_url,
                  channable_product_id: firstVariant.channable_product_id,
                  active: firstVariant.active !== undefined ? firstVariant.active : true,
                  is_parent_product: true,
                  variant_position: 1,
                  variant_title: variantInfo.raw || 'Standaard',
                  option1_name: shopifyStructure.options[0]?.name,
                  option1_value: shopifyStructure.variants[0]?.option1,
                  option2_name: shopifyStructure.options[1]?.name,
                  option2_value: shopifyStructure.variants[0]?.option2,
                  option3_name: shopifyStructure.options[2]?.name,
                  option3_value: shopifyStructure.variants[0]?.option3
                })
                .returning('id');

              results.imported++;
              results.parent_products++;

              // Insert other variants
              for (let i = 1; i < group.variants.length; i++) {
                const variant = group.variants[i];
                const shopifyVariant = shopifyStructure.variants[i];
                const variantInfo = variant.variantInfo;

                await db('products').insert({
                  shopify_customer_id: customerId,
                  parent_product_id: parent.id,
                  product_name: group.baseName,
                  product_ean: variant.product_ean,
                  product_sku: variant.product_sku,
                  brand: group.brand,
                  category: variant.category,
                  own_price: variant.own_price,
                  product_url: variant.product_url,
                  image_url: variant.image_url,
                  channable_product_id: variant.channable_product_id,
                  active: variant.active !== undefined ? variant.active : true,
                  is_parent_product: false,
                  variant_position: i + 1,
                  variant_title: shopifyVariant.title,
                  option1_name: shopifyStructure.options[0]?.name,
                  option1_value: shopifyVariant.option1,
                  option2_name: shopifyStructure.options[1]?.name,
                  option2_value: shopifyVariant.option2,
                  option3_name: shopifyStructure.options[2]?.name,
                  option3_value: shopifyVariant.option3
                });

                results.imported++;
                results.variants_created++;
              }

            } catch (error) {
              results.failed++;
              results.errors.push({
                product: group.baseName || 'unknown',
                error: error.message
              });
            }
          }

        } else {
          // Original non-grouped import logic
          for (const product of customerProducts) {
            try {
              // Validate required fields
              if (!product.product_name) {
                results.failed++;
                results.errors.push({
                  product: product.product_name || 'unknown',
                  error: 'product_name is required'
                });
                continue;
              }

              // Check for duplicate by EAN
              if (product.product_ean) {
                const existing = await db('products')
                  .where({ 
                    product_ean: product.product_ean, 
                    shopify_customer_id: customerId 
                  })
                  .first();

                if (existing) {
                  results.skipped++;
                  continue;
                }
              }

              // Insert product
              await db('products').insert({
                shopify_customer_id: customerId,
                product_name: product.product_name,
                product_ean: product.product_ean,
                product_sku: product.product_sku,
                brand: product.brand,
                category: product.category,
                own_price: product.own_price,
                product_url: product.product_url,
                image_url: product.image_url,
                channable_product_id: product.channable_product_id,
                active: product.active !== undefined ? product.active : true
              });

              results.imported++;

            } catch (error) {
              results.failed++;
              results.errors.push({
                product: product.product_name || 'unknown',
                error: error.message
              });
            }
          }
        }

      } catch (error) {
        console.error(`Error processing customer ${customerId}:`, error);
        results.errors.push({
          customer: customerId,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({
      error: 'Failed to import products',
      message: error.message
    });
  }
});

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

// GET /api/v1/products/:customerId
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await ProductInsightsService.getProductOverview(customerId, {
      search: req.query.search,
      limit: req.query.limit,
      page: req.query.page,
      sort: req.query.sort,
      order: req.query.order
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Product overview error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch product overview'
    });
  }
});

// GET /api/v1/products/:customerId/:productId/history
router.get('/:customerId/:productId/history', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const { retailer, days } = req.query;

    const result = await ProductInsightsService.getPriceHistory(customerId, productId, {
      retailer,
      days
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Price history error:', error.message);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to fetch price history'
    });
  }
});

// GET /api/v1/products/:customerId/:productId/competitors
router.get('/:customerId/:productId/competitors', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const result = await ProductInsightsService.getManualCompetitors(customerId, productId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Fetch manual competitors error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/v1/products/:customerId/:productId/competitors
router.post('/:customerId/:productId/competitors', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const payload = {
      retailer: req.body.retailer,
      competitorUrl: req.body.competitorUrl
    };

    const result = await ProductInsightsService.addManualCompetitor(customerId, productId, payload);
    res.status(201).json({ success: true, competitor: result });
  } catch (error) {
    console.error('❌ Add manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/products/:customerId/:productId/competitors/:competitorId
router.put('/:customerId/:productId/competitors/:competitorId', async (req, res) => {
  try {
    const { customerId, productId, competitorId } = req.params;
    const payload = {
      retailer: req.body.retailer,
      competitorUrl: req.body.competitorUrl,
      active: req.body.active
    };

    await ProductInsightsService.updateManualCompetitor(
      customerId,
      productId,
      competitorId,
      payload
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Update manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/products/:customerId/:productId/competitors/:competitorId
router.delete('/:customerId/:productId/competitors/:competitorId', async (req, res) => {
  try {
    const { customerId, productId, competitorId } = req.params;
    await ProductInsightsService.deleteManualCompetitor(customerId, productId, competitorId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete manual competitor error:', error.message);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
