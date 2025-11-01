/**
 * Domain extraction utilities for competitor registry
 */

/**
 * Extract clean domain from URL
 * @param {string} url - Full URL
 * @returns {string|null} - Clean domain (e.g., 'bol.com')
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    // Remove www., m., etc.
    return urlObj.hostname.replace(/^(www\.|m\.|shop\.)/, '');
  } catch (error) {
    console.error('Invalid URL:', url, error.message);
    return null;
  }
}

/**
 * Normalize retailer name for display
 * @param {string} domain - Domain name
 * @returns {string} - Normalized retailer name
 */
function normalizeRetailerName(domain) {
  const knownRetailers = {
    'bol.com': 'bol.',
    'coolblue.nl': 'Coolblue',
    'mediamarkt.nl': 'MediaMarkt',
    'saturn.nl': 'Saturn',
    'amazon.nl': 'Amazon',
    'wehkamp.nl': 'Wehkamp',
    'hifi.nl': 'Hifi.nl',
    'hifi.eu': 'hifi.eu',
    'multifoon.nl': 'multifoon Hifi',
    'audioexpert.nl': 'audioexpert.nl',
    'alternate.nl': 'Alternate',
    'conrad.nl': 'Conrad',
    'expert.nl': 'Expert',
    'bol.be': 'bol.com (BE)',
  };
  
  return knownRetailers[domain] || domain;
}

/**
 * Extract company name from domain for email
 * @param {string} domain - Domain name
 * @returns {string} - Company name
 */
function extractCompanyName(domain) {
  // Remove TLD
  const name = domain.split('.')[0];
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

module.exports = {
  extractDomain,
  normalizeRetailerName,
  extractCompanyName
};
