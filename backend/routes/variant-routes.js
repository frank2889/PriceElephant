/**
 * Product Variant Routes
 * Handles manual variant creation and management by customers
 */

const express = require('express');
const db = require('../config/database');

const router = express.Router();

/**
 * POST /api/v1/products/:customerId/:productId/variants
 * Add a new variant to an existing product
 */
router.post('/:customerId/:productId/variants', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const {
      product_name,
      product_ean,
      product_sku,
      own_price,
      option1_name, // e.g. "Kleur"
      option1_value, // e.g. "Rood"
      option2_name,
      option2_value,
      option3_name,
      option3_value,
      image_url,
      active = true
    } = req.body;

    // Verify parent product exists and belongs to customer
    const parentProduct = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!parentProduct) {
      return res.status(404).json({
        error: 'Parent product not found or does not belong to this customer'
      });
    }

    // Update parent product to be marked as parent
    await db('products')
      .where({ id: productId })
      .update({ is_parent_product: true });

    // Get next variant position
    const lastVariant = await db('products')
      .where({ parent_product_id: productId })
      .orderBy('variant_position', 'desc')
      .first();

    const nextPosition = lastVariant ? lastVariant.variant_position + 1 : 2; // Parent is position 1

    // Generate variant title
    const variantParts = [];
    if (option1_value) variantParts.push(option1_value);
    if (option2_value) variantParts.push(option2_value);
    if (option3_value) variantParts.push(option3_value);
    const variant_title = variantParts.join(' / ') || 'Variant';

    // Check for duplicate variant (only check provided options)
    const duplicateQuery = db('products')
      .where({ parent_product_id: productId });
    
    if (option1_value !== undefined) duplicateQuery.where({ option1_value });
    if (option2_value !== undefined) duplicateQuery.where({ option2_value });
    if (option3_value !== undefined) duplicateQuery.where({ option3_value });
    
    const existingVariant = await duplicateQuery.first();

    if (existingVariant) {
      return res.status(409).json({
        error: 'Variant with these options already exists',
        variant_id: existingVariant.id
      });
    }

    // Insert new variant
    const [variant] = await db('products')
      .insert({
        shopify_customer_id: customerId,
        parent_product_id: productId,
        product_name: product_name || parentProduct.product_name,
        product_ean,
        product_sku,
        brand: parentProduct.brand,
        category: parentProduct.category,
        own_price,
        image_url: image_url || parentProduct.image_url,
        variant_title,
        variant_position: nextPosition,
        option1_name,
        option1_value,
        option2_name,
        option2_value,
        option3_name,
        option3_value,
        is_parent_product: false,
        active
      })
      .returning('*');

    res.status(201).json({
      success: true,
      variant,
      message: `Variant "${variant_title}" created successfully`
    });

  } catch (error) {
    console.error('Create variant error:', error);
    res.status(500).json({
      error: 'Failed to create variant',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/products/:customerId/:productId/variants
 * Get all variants of a product
 */
router.get('/:customerId/:productId/variants', async (req, res) => {
  try {
    const { customerId, productId } = req.params;

    // Get parent product
    const parentProduct = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!parentProduct) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    // Get all variants
    const variants = await db('products')
      .where({ parent_product_id: productId })
      .orderBy('variant_position', 'asc');

    // Get option names from first variant or parent
    const options = [];
    const allProducts = [parentProduct, ...variants];
    
    if (allProducts.some(p => p.option1_name)) {
      const values = [...new Set(allProducts.map(p => p.option1_value).filter(Boolean))];
      options.push({
        name: allProducts.find(p => p.option1_name)?.option1_name,
        values
      });
    }
    
    if (allProducts.some(p => p.option2_name)) {
      const values = [...new Set(allProducts.map(p => p.option2_value).filter(Boolean))];
      options.push({
        name: allProducts.find(p => p.option2_name)?.option2_name,
        values
      });
    }
    
    if (allProducts.some(p => p.option3_name)) {
      const values = [...new Set(allProducts.map(p => p.option3_value).filter(Boolean))];
      options.push({
        name: allProducts.find(p => p.option3_name)?.option3_name,
        values
      });
    }

    res.json({
      success: true,
      parent: parentProduct,
      variants,
      options,
      total_variants: variants.length
    });

  } catch (error) {
    console.error('Get variants error:', error);
    res.status(500).json({
      error: 'Failed to fetch variants',
      message: error.message
    });
  }
});

/**
 * PUT /api/v1/products/:customerId/:productId/variants/:variantId
 * Update a variant
 */
router.put('/:customerId/:productId/variants/:variantId', async (req, res) => {
  try {
    const { customerId, productId, variantId } = req.params;
    const updates = req.body;

    // Verify variant exists
    const variant = await db('products')
      .where({
        id: variantId,
        parent_product_id: productId,
        shopify_customer_id: customerId
      })
      .first();

    if (!variant) {
      return res.status(404).json({
        error: 'Variant not found'
      });
    }

    // Update variant title if options changed
    if (updates.option1_value || updates.option2_value || updates.option3_value) {
      const variantParts = [];
      if (updates.option1_value || variant.option1_value) {
        variantParts.push(updates.option1_value || variant.option1_value);
      }
      if (updates.option2_value || variant.option2_value) {
        variantParts.push(updates.option2_value || variant.option2_value);
      }
      if (updates.option3_value || variant.option3_value) {
        variantParts.push(updates.option3_value || variant.option3_value);
      }
      updates.variant_title = variantParts.join(' / ');
    }

    updates.updated_at = new Date();

    await db('products')
      .where({ id: variantId })
      .update(updates);

    const updated = await db('products')
      .where({ id: variantId })
      .first();

    res.json({
      success: true,
      variant: updated,
      message: 'Variant updated successfully'
    });

  } catch (error) {
    console.error('Update variant error:', error);
    res.status(500).json({
      error: 'Failed to update variant',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/products/:customerId/:productId/variants/:variantId
 * Delete a variant
 */
router.delete('/:customerId/:productId/variants/:variantId', async (req, res) => {
  try {
    const { customerId, productId, variantId } = req.params;

    // Verify variant exists
    const variant = await db('products')
      .where({
        id: variantId,
        parent_product_id: productId,
        shopify_customer_id: customerId
      })
      .first();

    if (!variant) {
      return res.status(404).json({
        error: 'Variant not found'
      });
    }

    await db('products')
      .where({ id: variantId })
      .del();

    res.json({
      success: true,
      message: 'Variant deleted successfully'
    });

  } catch (error) {
    console.error('Delete variant error:', error);
    res.status(500).json({
      error: 'Failed to delete variant',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/products/:customerId/:productId/convert-to-parent
 * Convert a standalone product to a parent product (preparing for variants)
 */
router.post('/:customerId/:productId/convert-to-parent', async (req, res) => {
  try {
    const { customerId, productId } = req.params;
    const {
      option1_name, // e.g. "Kleur", "Maat"
      option1_value // The value for the current product
    } = req.body;

    const product = await db('products')
      .where({ id: productId, shopify_customer_id: customerId })
      .first();

    if (!product) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    if (product.parent_product_id) {
      return res.status(400).json({
        error: 'Product is already a variant, cannot convert to parent'
      });
    }

    // Update product to be a parent with first option
    await db('products')
      .where({ id: productId })
      .update({
        is_parent_product: true,
        option1_name,
        option1_value,
        variant_title: option1_value || 'Standaard',
        variant_position: 1,
        updated_at: new Date()
      });

    const updated = await db('products')
      .where({ id: productId })
      .first();

    res.json({
      success: true,
      product: updated,
      message: 'Product converted to parent. You can now add variants.'
    });

  } catch (error) {
    console.error('Convert to parent error:', error);
    res.status(500).json({
      error: 'Failed to convert product',
      message: error.message
    });
  }
});

module.exports = router;
