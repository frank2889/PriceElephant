/**
 * Variant Grouping Utility
 * 
 * Intelligently groups product variants (colors, sizes, packages) 
 * into parent products with variants
 */

class VariantGrouping {
  /**
   * Extract base product name (without variant info)
   */
  static extractBaseName(productName) {
    // Clean whitespace first
    let name = productName.trim().replace(/\s+/g, ' ');
    
    // Remove common variant indicators
    const variantPatterns = [
      /\s*[-–—]\s*\d+\s*(tabletten?|stuks?|ml|liter|l|kg|gram?|g|pieces?)\s*$/i,
      /\s*[-–—]\s*(spray|navulling|refill|combo|set|pack)\s*\d*\s*$/i,
      /\s*[-–—]\s*(naturel|wit|zwart|grijs|rood|blauw|groen|geel|oranje|bruin|roze|paars)\s*$/i,
      /\s*[-–—]\s*(natural|white|black|grey|gray|red|blue|green|yellow|orange|brown|pink|purple)\s*$/i,
      /\s*[-–—]\s*(klein|small|s|medium|m|groot|large|l|xl|xxl)\s*$/i,
      /\s*\([^)]*\d+\s*(ml|l|kg|g|tabletten?|stuks?)[^)]*\)\s*$/i,
      /\s*\/\s*\d+\s*(ml|l|kg|g|tabletten?|stuks?)\s*$/i,
      /\s*[-–—]\s*\d+\s*x\s*\d+\s*$/i, // 2x500ml
    ];
    
    for (const pattern of variantPatterns) {
      name = name.replace(pattern, '').trim();
    }
    
    return name;
  }

  /**
   * Extract variant details from product name
   */
  static extractVariantInfo(productName) {
    const cleaned = productName.trim().replace(/\s+/g, ' ');
    const baseName = this.extractBaseName(productName);
    const variantText = cleaned.substring(baseName.length).trim();
    
    const variant = {
      size: null,
      color: null,
      package: null,
      quantity: null,
      type: null,
      raw: variantText
    };

    // Extract size/volume
    const sizeMatch = variantText.match(/(\d+(?:[.,]\d+)?)\s*(ml|liter|l|kg|gram|g|tabletten?|stuks?)/i);
    if (sizeMatch) {
      variant.size = `${sizeMatch[1]}${sizeMatch[2]}`;
      variant.quantity = parseFloat(sizeMatch[1].replace(',', '.'));
    }

    // Extract color (Dutch & English)
    const colorPatterns = {
      'naturel|natural': 'Naturel',
      'wit|white|extra wit': 'Wit',
      'zwart|black': 'Zwart',
      'grijs|grey|gray': 'Grijs',
      'rood|red': 'Rood',
      'blauw|blue': 'Blauw',
      'groen|green': 'Groen',
      'geel|yellow': 'Geel',
      'oranje|orange': 'Oranje',
      'bruin|brown': 'Bruin',
      'roze|pink': 'Roze',
      'paars|purple': 'Paars'
    };

    for (const [pattern, colorName] of Object.entries(colorPatterns)) {
      if (new RegExp(pattern, 'i').test(variantText)) {
        variant.color = colorName;
        break;
      }
    }

    // Extract package type
    const typePatterns = {
      'spray': 'Spray',
      'navulling|refill': 'Navulling',
      'combo|combinatie|set': 'Combo',
      'pack': 'Pack'
    };

    for (const [pattern, typeName] of Object.entries(typePatterns)) {
      if (new RegExp(pattern, 'i').test(variantText)) {
        variant.type = typeName;
        break;
      }
    }

    return variant;
  }

  /**
   * Group products by base name
   */
  static groupProducts(products) {
    const groups = new Map();

    for (const product of products) {
      const baseName = this.extractBaseName(product.title || product.product_name);
      const variantInfo = this.extractVariantInfo(product.title || product.product_name);

      if (!groups.has(baseName)) {
        groups.set(baseName, {
          baseName,
          brand: product.brand,
          category: product.category,
          variants: []
        });
      }

      const group = groups.get(baseName);
      group.variants.push({
        ...product,
        variantInfo,
        isMainVariant: group.variants.length === 0 // First variant is main
      });
    }

    return Array.from(groups.values());
  }

  /**
   * Generate variant title for Shopify
   */
  static generateVariantTitle(variantInfo) {
    const parts = [];
    
    if (variantInfo.color) parts.push(variantInfo.color);
    if (variantInfo.size) parts.push(variantInfo.size);
    if (variantInfo.type) parts.push(variantInfo.type);
    
    return parts.length > 0 ? parts.join(' / ') : 'Standaard';
  }

  /**
   * Create variant option structure for Shopify
   */
  static createShopifyVariants(productGroup) {
    const hasColors = productGroup.variants.some(v => v.variantInfo.color);
    const hasSizes = productGroup.variants.some(v => v.variantInfo.size);
    const hasTypes = productGroup.variants.some(v => v.variantInfo.type);

    const options = [];
    if (hasColors) options.push({ name: 'Kleur', values: [] });
    if (hasSizes) options.push({ name: 'Maat/Volume', values: [] });
    if (hasTypes) options.push({ name: 'Type', values: [] });

    const variants = productGroup.variants.map(variant => {
      const option1 = hasColors ? (variant.variantInfo.color || 'Standaard') : null;
      const option2 = hasSizes ? (variant.variantInfo.size || 'Standaard') : null;
      const option3 = hasTypes ? (variant.variantInfo.type || 'Standaard') : null;

      // Add to option values
      if (option1 && !options[0].values.includes(option1)) options[0].values.push(option1);
      if (option2 && options[1] && !options[1].values.includes(option2)) options[1].values.push(option2);
      if (option3 && options[2] && !options[2].values.includes(option3)) options[2].values.push(option3);

      return {
        title: this.generateVariantTitle(variant.variantInfo),
        price: variant.price,
        sku: variant.sku || variant.externalId,
        barcode: variant.ean,
        option1,
        option2,
        option3,
        inventory_quantity: variant.inStock ? 100 : 0,
        inventory_management: 'shopify'
      };
    });

    return {
      options: options.filter(o => o.values.length > 0),
      variants
    };
  }

  /**
   * Analyze product feed for variant patterns
   */
  static analyzeVariantPatterns(products) {
    const groups = this.groupProducts(products);
    
    const stats = {
      totalProducts: products.length,
      totalGroups: groups.length,
      productsWithVariants: groups.filter(g => g.variants.length > 1).length,
      largestVariantCount: Math.max(...groups.map(g => g.variants.length)),
      variantDistribution: {}
    };

    // Count variant distribution
    for (const group of groups) {
      const count = group.variants.length;
      stats.variantDistribution[count] = (stats.variantDistribution[count] || 0) + 1;
    }

    return {
      stats,
      groups: groups.filter(g => g.variants.length > 1).slice(0, 10), // Top 10 examples
      singleProducts: groups.filter(g => g.variants.length === 1).length
    };
  }
}

// Export instance methods as standalone functions
const groupingInstance = new VariantGrouping();

module.exports = {
  extractBaseName: (name) => VariantGrouping.extractBaseName(name),
  extractVariantInfo: (name) => VariantGrouping.extractVariantInfo(name),
  groupProducts: (products) => VariantGrouping.groupProducts(products),
  createShopifyVariants: (group) => VariantGrouping.createShopifyVariants(group),
  analyzeVariants: (products) => VariantGrouping.analyzeVariants(products),
  VariantGrouping // Export class for direct use if needed
};
