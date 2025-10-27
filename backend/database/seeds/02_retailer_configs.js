/**
 * Seed Retailer Configurations
 * Playwright selectors for Coolblue, Bol.com, Amazon.nl, MediaMarkt
 */

exports.seed = async function(knex) {
  await knex('retailer_configs').del();

  await knex('retailer_configs').insert([
    {
      retailer_name: 'coolblue',
      active: true,
      success_rate: 95,
      playwright_config: JSON.stringify({
        selectors: {
          price: '.sales-price__current',
          title: 'h1.product-name',
          stock: '.availability-label',
          image: '.product-image-viewer__image img'
        },
        wait_for: '.sales-price__current',
        timeout: 10000,
        requires_js: true
      }),
      proxy_config: JSON.stringify({
        provider: 'webshare',
        country: 'nl',
        sticky_session: true
      })
    },
    {
      retailer_name: 'bol.com',
      active: true,
      success_rate: 95,
      playwright_config: JSON.stringify({
        selectors: {
          price: '.promo-price',
          title: '[data-test="title"]',
          stock: '.buy-block__delivery',
          image: '.product-image img'
        },
        wait_for: '.promo-price',
        timeout: 10000,
        requires_js: true
      }),
      proxy_config: JSON.stringify({
        provider: 'webshare',
        country: 'nl',
        sticky_session: true
      })
    },
    {
      retailer_name: 'amazon.nl',
      active: true,
      success_rate: 90,
      playwright_config: JSON.stringify({
        selectors: {
          price: '.a-price-whole',
          title: '#productTitle',
          stock: '#availability span',
          image: '#landingImage'
        },
        wait_for: '.a-price-whole',
        timeout: 15000,
        requires_js: true,
        anti_bot: true
      }),
      proxy_config: JSON.stringify({
        provider: 'oxylabs',
        country: 'nl',
        sticky_session: true,
        rotate_every: 5
      })
    },
    {
      retailer_name: 'mediamarkt',
      active: true,
      success_rate: 90,
      playwright_config: JSON.stringify({
        selectors: {
          price: '.price',
          title: '.product-title',
          stock: '.availability-text',
          image: '.product-gallery__image img'
        },
        wait_for: '.price',
        timeout: 10000,
        requires_js: true
      }),
      proxy_config: JSON.stringify({
        provider: 'webshare',
        country: 'nl',
        sticky_session: true
      })
    }
  ]);
};
