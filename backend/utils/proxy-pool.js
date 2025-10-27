/**
 * Proxy Pool Manager
 * 
 * Manages multiple proxy tiers:
 * - Tier 1: Direct (no proxy) - FREE
 * - Tier 2: Free public proxies - FREE (wisselend)
 * - Tier 3: WebShare residential - €0.0003/request
 * 
 * Features:
 * - Health checking
 * - Auto rotation
 * - Success rate tracking
 * - Cost optimization
 */

require('dotenv').config();
const axios = require('axios');

class ProxyPool {
  constructor() {
    this.proxies = {
      // Tier 1: No proxy (direct scraping)
      direct: {
        tier: 1,
        cost: 0,
        enabled: true,
        successRate: 0.6, // 60% baseline
        totalRequests: 0,
        successfulRequests: 0
      },
      
      // Tier 2: Free public proxies (NL focused)
      free: {
        tier: 2,
        cost: 0,
        enabled: true,
        list: [], // Will be populated from free proxy sources
        currentIndex: 0,
        successRate: 0.4, // 40% baseline voor free proxies
        totalRequests: 0,
        successfulRequests: 0
      },
      
      // Tier 3: WebShare datacenter proxies (cheap, reliable)
      webshare: {
        tier: 3,
        cost: 0.0003, // €30/100k requests
        enabled: !!process.env.WEBSHARE_API_KEY,
        host: 'proxy.webshare.io',
        port: 80,
        username: process.env.WEBSHARE_USERNAME,
        password: process.env.WEBSHARE_PASSWORD,
        successRate: 0.9, // 90% verwacht
        totalRequests: 0,
        successfulRequests: 0
      }
    };
    
    this.costTracker = {
      totalCost: 0,
      requestsByTier: { 1: 0, 2: 0, 3: 0, 4: 0 },
      costByTier: { 1: 0, 2: 0, 3: 0, 4: 0 }
    };
  }

  /**
   * Get best proxy for next request (cascade through tiers)
   */
  async getNextProxy() {
    // Try Tier 1: Direct (no proxy)
    if (this.proxies.direct.enabled && this.shouldTryTier(this.proxies.direct)) {
      return this.createProxyConfig('direct');
    }
    
    // Try Tier 2: Free proxies
    if (this.proxies.free.enabled && this.proxies.free.list.length > 0) {
      const freeProxy = this.getNextFreeProxy();
      if (freeProxy) {
        return this.createProxyConfig('free', freeProxy);
      }
    }
    
    // Try Tier 3: WebShare (cheap paid)
    if (this.proxies.webshare.enabled) {
      return this.createProxyConfig('webshare');
    }
    
    // No proxy available, try direct anyway
    return this.createProxyConfig('direct');
  }

  /**
   * Should we try this tier based on success rate?
   */
  shouldTryTier(tier) {
    // Always try if we haven't collected enough data
    if (tier.totalRequests < 10) return true;
    
    // Try if success rate is acceptable (>50%)
    return tier.successRate > 0.5;
  }

  /**
   * Get next free proxy from rotation
   */
  getNextFreeProxy() {
    if (this.proxies.free.list.length === 0) return null;
    
    const proxy = this.proxies.free.list[this.proxies.free.currentIndex];
    this.proxies.free.currentIndex = (this.proxies.free.currentIndex + 1) % this.proxies.free.list.length;
    
    return proxy;
  }

  /**
   * Create proxy config for Playwright
   */
  createProxyConfig(tier, customProxy = null) {
    const config = {
      tier: tier,
      cost: this.proxies[tier]?.cost || 0
    };
    
    if (tier === 'direct') {
      config.proxy = null;
      return config;
    }
    
    if (tier === 'free' && customProxy) {
      config.proxy = {
        server: `http://${customProxy.host}:${customProxy.port}`,
        username: customProxy.username,
        password: customProxy.password
      };
      return config;
    }
    
    if (tier === 'webshare') {
      const proxyInfo = this.proxies[tier];
      config.proxy = {
        server: `http://${proxyInfo.host}:${proxyInfo.port}`,
        username: proxyInfo.username,
        password: proxyInfo.password
      };
      return config;
    }
    
    return config;
  }

  /**
   * Record scrape result for success tracking
   */
  recordResult(tier, success, cost = 0) {
    const proxy = this.proxies[tier];
    if (!proxy) return;
    
    proxy.totalRequests++;
    if (success) {
      proxy.successfulRequests++;
    }
    
    // Update success rate (moving average)
    proxy.successRate = proxy.successfulRequests / proxy.totalRequests;
    
    // Track costs
    this.costTracker.totalCost += cost;
    this.costTracker.requestsByTier[proxy.tier]++;
    this.costTracker.costByTier[proxy.tier] += cost;
  }

  /**
   * Fetch free proxies from public sources
   */
  async refreshFreeProxies() {
    try {
      console.log('🔄 Fetching free NL proxies...');
      
      // Option 1: ProxyScrape (free API)
      const response = await axios.get('https://api.proxyscrape.com/v2/', {
        params: {
          request: 'displayproxies',
          protocol: 'http',
          timeout: 10000,
          country: 'NL',
          ssl: 'all',
          anonymity: 'all'
        },
        timeout: 5000
      });
      
      const proxyList = response.data.split('\n').filter(p => p.trim());
      
      this.proxies.free.list = proxyList.map(proxy => {
        const [host, port] = proxy.split(':');
        return { host, port: parseInt(port) };
      });
      
      console.log(`✅ Loaded ${this.proxies.free.list.length} free NL proxies`);
      return this.proxies.free.list.length;
      
    } catch (error) {
      console.error('❌ Failed to fetch free proxies:', error.message);
      
      // Fallback: Hardcoded reliable free proxies (NL/EU)
      this.proxies.free.list = [
        { host: '185.162.228.78', port: 3128 },
        { host: '185.162.230.55', port: 3128 },
        { host: '217.145.94.196', port: 8080 },
      ];
      
      return this.proxies.free.list.length;
    }
  }

  /**
   * Test proxy health
   */
  async testProxy(proxyConfig) {
    try {
      const testUrl = 'https://www.coolblue.nl';
      const startTime = Date.now();
      
      const response = await axios.get(testUrl, {
        proxy: proxyConfig.proxy ? {
          host: proxyConfig.proxy.server.replace('http://', '').split(':')[0],
          port: parseInt(proxyConfig.proxy.server.split(':')[2])
        } : false,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: response.status === 200,
        responseTime,
        statusCode: response.status
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cost statistics
   */
  getStats() {
    const totalRequests = Object.values(this.costTracker.requestsByTier).reduce((a, b) => a + b, 0);
    
    return {
      totalCost: this.costTracker.totalCost.toFixed(2),
      totalRequests,
      costPerRequest: totalRequests > 0 ? (this.costTracker.totalCost / totalRequests).toFixed(4) : 0,
      byTier: Object.entries(this.proxies).map(([name, proxy]) => ({
        name,
        tier: proxy.tier,
        requests: this.costTracker.requestsByTier[proxy.tier] || 0,
        cost: this.costTracker.costByTier[proxy.tier]?.toFixed(2) || 0,
        successRate: (proxy.successRate * 100).toFixed(1) + '%',
        enabled: proxy.enabled
      }))
    };
  }

  /**
   * Optimize proxy selection based on performance
   */
  optimizeSelection() {
    // Disable tiers with consistently low success rates
    Object.entries(this.proxies).forEach(([name, proxy]) => {
      if (proxy.totalRequests > 20 && proxy.successRate < 0.3) {
        console.log(`⚠️  Disabling ${name} tier (success rate: ${(proxy.successRate * 100).toFixed(1)}%)`);
        proxy.enabled = false;
      }
    });
  }
}

module.exports = ProxyPool;
