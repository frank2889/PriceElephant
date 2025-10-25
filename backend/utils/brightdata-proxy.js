/**
 * BrightData Proxy Integration
 * Handles proxy rotation with Dutch IP targeting for bypassing anti-bot systems
 */

require('dotenv').config();

class BrightDataProxy {
  constructor() {
    // BrightData credentials (get from trial account)
    this.username = process.env.BRIGHTDATA_USERNAME;
    this.password = process.env.BRIGHTDATA_PASSWORD;
    this.host = 'brd.superproxy.io';
    this.port = 22225;
    
    // Session management
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate unique session ID for sticky sessions
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get proxy server URL for Playwright
   */
  getProxyConfig() {
    return {
      server: `http://${this.host}:${this.port}`,
      username: `${this.username}-session-${this.sessionId}`,
      password: this.password
    };
  }

  /**
   * Rotate to new session (use after blocks or failures)
   */
  rotateSession() {
    this.sessionId = this.generateSessionId();
    console.log(`🔄 Rotated to new proxy session: ${this.sessionId}`);
  }

  /**
   * Get country-specific proxy (for Dutch retailers)
   */
  getDutchProxyConfig() {
    return {
      server: `http://${this.host}:${this.port}`,
      username: `${this.username}-country-nl-session-${this.sessionId}`,
      password: this.password
    };
  }

  /**
   * Test proxy connection
   */
  static async test() {
    const { chromium } = require('playwright');
    const proxy = new BrightDataProxy();
    
    if (!proxy.username || !proxy.password) {
      console.log('⚠️  BrightData credentials not configured');
      console.log('💡 Get free trial: https://brightdata.com/');
      console.log('💡 Set BRIGHTDATA_USERNAME and BRIGHTDATA_PASSWORD in .env');
      return false;
    }

    try {
      console.log('🔍 Testing BrightData proxy connection...');
      
      const browser = await chromium.launch({
        headless: true,
        proxy: proxy.getDutchProxyConfig()
      });

      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Test with IP check
      await page.goto('https://lumtest.com/myip.json', { timeout: 30000 });
      const ipData = await page.evaluate(() => document.body.textContent);
      const ip = JSON.parse(ipData);
      
      await browser.close();

      console.log('✅ Proxy connection successful!');
      console.log(`📍 IP: ${ip.ip}`);
      console.log(`🌍 Country: ${ip.country}`);
      console.log(`🏙️  City: ${ip.city || 'Unknown'}`);
      
      if (ip.country !== 'NL') {
        console.log('⚠️  Warning: Not using Dutch IP. Try getDutchProxyConfig()');
      }

      return true;

    } catch (error) {
      console.error('❌ Proxy test failed:', error.message);
      console.log('💡 Check your BrightData credentials and account balance');
      return false;
    }
  }
}

module.exports = BrightDataProxy;

// Test if run directly
if (require.main === module) {
  BrightDataProxy.test()
    .then((success) => {
      process.exit(success ? 0 : 1);
    });
}
