/**
 * Channable Integration Module
 * 
 * Handles product import from Channable feeds and API
 * Channable is the single source of truth for product data
 */

const axios = require('axios');
const xml2js = require('xml2js');

class ChannableIntegration {
    constructor(config) {
        this.companyId = config.companyId;
        this.apiToken = config.apiToken;
        this.projectId = config.projectId;
        this.feedUrl = config.feedUrl; // Optional: direct feed URL
        this.baseUrl = 'https://api.channable.com/v1';
    }

    /**
     * Import products from Channable API
     * Uses Channable REST API to fetch product data
     */
    async importFromAPI() {
        try {
            const url = `${this.baseUrl}/companies/${this.companyId}/projects/${this.projectId}/items`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`
                },
                params: {
                    limit: 1000 // Adjust based on needs
                }
            });

            return this.parseChannableProducts(response.data.items);
        } catch (error) {
            console.error('Channable API import error:', error.message);
            throw new Error(`Failed to import from Channable API: ${error.message}`);
        }
    }

    /**
     * Import products from Channable XML/CSV feed URL
     * Alternative method when direct feed URL is available
     */
    async importFromFeed() {
        if (!this.feedUrl) {
            throw new Error('No feed URL configured');
        }

        try {
            const response = await axios.get(this.feedUrl);
            const contentType = response.headers['content-type'];

            if (contentType.includes('xml')) {
                return await this.parseXMLFeed(response.data);
            } else if (contentType.includes('csv')) {
                return this.parseCSVFeed(response.data);
            } else {
                throw new Error(`Unsupported feed format: ${contentType}`);
            }
        } catch (error) {
            console.error('Channable feed import error:', error.message);
            throw new Error(`Failed to import from feed: ${error.message}`);
        }
    }

    /**
     * Parse Channable API response to standardized product format
     */
    parseChannableProducts(items) {
        return items.map(item => ({
            externalId: item.id,
            ean: item.gtin || item.ean || null,
            sku: item.sku || item.id,
            title: item.title,
            brand: item.brand || null,
            price: parseFloat(item.price),
            url: item.link || null,
            imageUrl: item.image_link || null,
            category: item.product_type || null,
            description: item.description || null,
            inStock: item.availability === 'in stock',
            channableData: item // Store full Channable data for reference
        }));
    }

    /**
     * Parse XML feed (Google Shopping format)
     */
    async parseXMLFeed(xmlData) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlData);
        
        // Google Shopping XML format
        const items = result.rss?.channel?.[0]?.item || [];
        
        return items.map(item => ({
            externalId: this.getXMLValue(item, 'g:id'),
            ean: this.getXMLValue(item, 'g:gtin') || this.getXMLValue(item, 'g:ean'),
            sku: this.getXMLValue(item, 'g:id'),
            title: this.getXMLValue(item, 'g:title') || this.getXMLValue(item, 'title'),
            brand: this.getXMLValue(item, 'g:brand'),
            price: parseFloat(this.getXMLValue(item, 'g:price')?.replace(/[^0-9.]/g, '') || 0),
            url: this.getXMLValue(item, 'g:link') || this.getXMLValue(item, 'link'),
            imageUrl: this.getXMLValue(item, 'g:image_link'),
            category: this.getXMLValue(item, 'g:product_type'),
            description: this.getXMLValue(item, 'g:description') || this.getXMLValue(item, 'description'),
            inStock: this.getXMLValue(item, 'g:availability') === 'in stock'
        }));
    }

    /**
     * Helper to extract value from XML object
     */
    getXMLValue(obj, key) {
        const keys = key.split(':');
        let value = obj;
        
        for (const k of keys) {
            value = value?.[k];
        }
        
        return Array.isArray(value) ? value[0] : value;
    }

    /**
     * Parse CSV feed
     */
    parseCSVFeed(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const products = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = this.parseCSVLine(lines[i]);
            const product = {};

            headers.forEach((header, index) => {
                product[header] = values[index];
            });

            products.push({
                externalId: product.id || product.sku,
                ean: product.gtin || product.ean || null,
                sku: product.sku || product.id,
                title: product.title || product.name,
                brand: product.brand || null,
                price: parseFloat(product.price?.replace(/[^0-9.]/g, '') || 0),
                url: product.link || product.url || null,
                imageUrl: product.image_link || product.image || null,
                category: product.product_type || product.category || null,
                description: product.description || null,
                inStock: product.availability === 'in stock'
            });
        }

        return products;
    }

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    /**
     * Test connection to Channable
     */
    async testConnection() {
        try {
            if (this.feedUrl) {
                const response = await axios.head(this.feedUrl);
                return { success: true, method: 'feed', status: response.status };
            } else {
                const url = `${this.baseUrl}/companies/${this.companyId}`;
                const response = await axios.get(url, {
                    headers: { 'Authorization': `Bearer ${this.apiToken}` }
                });
                return { success: true, method: 'api', company: response.data };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = ChannableIntegration;
