/**
 * Competitor Customer Service
 * Auto-creates Shopify customers and collections for competitors
 * Enables tracking competitor data + sales intelligence
 */

const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

/**
 * Create Shopify customer for competitor (prospect)
 * @param {number} registryId - competitor_registry.id
 * @param {string} domain - Competitor domain (e.g., 'bol.com')
 * @param {string} retailerName - Display name (e.g., 'bol.')
 * @param {object} shopify - ShopifyIntegration instance
 * @returns {Promise<object>} - Created customer data
 */
async function createCompetitorCustomer(registryId, domain, retailerName, shopify) {
  try {
    console.log(`👤 Creating Shopify customer for competitor: ${retailerName}`);
    
    // Extract company name for email
    const companyName = domain.split('.')[0];
    const email = `contact@${domain}`;
    
    // Create Shopify customer (without metafields - REST API limitation)
    const customer = await shopify.createCustomer({
      email: email,
      first_name: retailerName,
      last_name: '(Competitor)',
      note: `Auto-registered competitor. Domain: ${domain}. Registry ID: ${registryId}`,
      tags: 'competitor,prospect,auto-registered,tracked-by-customers'
    });
    
    console.log(`  ✅ Created Shopify customer: ${customer.id}`);
    
    // Update competitor_registry with Shopify customer ID
    await db('competitor_registry')
      .where({ id: registryId })
      .update({
        shopify_customer_id: customer.id,
        updated_at: new Date()
      });
    
    return customer;
    
  } catch (error) {
    console.error(`❌ Failed to create Shopify customer for ${retailerName}:`, error.message);
    throw error;
  }
}

/**
 * Create Shopify collection for competitor products
 * @param {number} registryId - competitor_registry.id
 * @param {string} domain - Competitor domain
 * @param {string} retailerName - Display name
 * @param {object} shopify - ShopifyIntegration instance
 * @returns {Promise<object>} - Created collection data
 */
async function createCompetitorCollection(registryId, domain, retailerName, shopify) {
  try {
    console.log(`📁 Creating Shopify collection for competitor: ${retailerName}`);
    
    // Create collection (without metafields - REST API limitation)
    const collection = await shopify.createCollection({
      title: `${retailerName} - Competitor Products`,
      handle: `competitor-${domain.replace(/\./g, '-')}`,
      body_html: `<p>Products tracked from competitor <strong>${retailerName}</strong> (${domain})</p><p>Auto-generated collection for competitive intelligence. Registry ID: ${registryId}</p>`,
      published: false  // Hidden from storefront
    });
    
    console.log(`  ✅ Created collection: ${collection.id}`);
    
    // Update competitor_registry with collection ID
    await db('competitor_registry')
      .where({ id: registryId })
      .update({
        shopify_collection_id: collection.id,
        updated_at: new Date()
      });
    
    return collection;
    
  } catch (error) {
    console.error(`❌ Failed to create collection for ${retailerName}:`, error.message);
    throw error;
  }
}

/**
 * Auto-setup competitor as Shopify customer + collection
 * Called when first competitor URL is added for a domain
 * @param {number} registryId - competitor_registry.id
 * @param {string} domain - Competitor domain
 * @param {string} retailerName - Display name
 * @param {string} shopifyDomain - Customer's Shopify domain
 * @param {string} accessToken - Customer's Shopify access token
 * @returns {Promise<object>} - Setup result
 */
async function setupCompetitorInShopify(registryId, domain, retailerName, shopifyDomain, accessToken) {
  try {
    console.log(`🚀 Setting up competitor in Shopify: ${retailerName}`);
    
    // Initialize Shopify integration
    const shopify = new ShopifyIntegration({
      shopDomain: shopifyDomain,
      accessToken: accessToken
    });
    
    // Create customer
    const customer = await createCompetitorCustomer(registryId, domain, retailerName, shopify);
    
    // Create collection
    const collection = await createCompetitorCollection(registryId, domain, retailerName, shopify);
    
    console.log(`✅ Competitor setup complete for ${retailerName}`);
    
    return {
      success: true,
      customer_id: customer.id,
      collection_id: collection.id
    };
    
  } catch (error) {
    console.error(`❌ Failed to setup competitor ${retailerName}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createCompetitorCustomer,
  createCompetitorCollection,
  setupCompetitorInShopify
};
