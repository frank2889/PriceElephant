# Complete Shopify Setup Guide

This guide covers the complete Shopify setup for PriceElephant: Custom App creation, multi-language configuration, and domain setup.

---

## 🔧 Part 1: Custom App Setup

To use the Shopify Admin API, you need to create a **Custom App** in your Shopify store.

### Step 1: Create Custom App

1. Go to Shopify Admin: https://admin.shopify.com/store/priceelephant
2. Go to **Settings** → **Apps and sales channels**
3. Click on **Develop apps**
4. Click on **Create an app**
5. App name: `PriceElephant Backend`
6. Click on **Create app**

### Step 2: Configure API Scopes

1. Click on **Configure Admin API scopes**
2. Select the following scopes:

#### Product Scopes:
- ✅ `read_products`
- ✅ `write_products`

#### Customer Scopes:
- ✅ `read_customers`
- ✅ `write_customers`

#### Order Scopes:
- ✅ `read_orders`

#### Metafield Scopes:
- ✅ `read_product_metafields`
- ✅ `write_product_metafields`

### Step 3: Install App

1. Click on **Install app**
2. Copy the **Admin API access token** (keep this secret!)
3. Store in your `.env` file as `SHOPIFY_ACCESS_TOKEN`

### Step 4: Configure Environment Variables

```bash
# Shopify Configuration
SHOPIFY_SHOP_DOMAIN=priceelephant.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret_key
```

---

## 🌍 Part 2: Multi-Language Setup

PriceElephant supports multiple languages via Shopify's native internationalization.

### Available Languages:
- 🇬🇧 **English** (default) - `en` - https://priceelephant.myshopify.com/
- 🇳🇱 **Dutch** - `nl` - https://priceelephant.myshopify.com/nl

### Shopify Admin Configuration

#### 1. Activate Markets & Languages

1. Go to **Shopify Admin** → **Settings** → **Markets**
2. Click on **Preferences**
3. Enable **International domains and languages**

#### 2. Add Dutch Language

1. Go to **Settings** → **Languages**
2. Click **Add language**
3. Select **Dutch (Netherlands)** - `nl-NL`
4. Set as **Published**

#### 3. Configure Default Language

1. In **Languages** settings
2. Set **Dutch** as primary language
3. Click **Make default** next to Dutch

### Theme Configuration

The theme automatically detects the language based on the URL:

```liquid
<!-- In layout/theme.liquid -->
<html lang="{{ request.locale.iso_code }}">

<!-- Language-specific content -->
{{ 'priceelephant.homepage.hero.title' | t }}
```

### Translation Structure

All translations are stored in `locales/` folder:

```
theme/locales/
├── en.default.json     # English (fallback)
├── nl.json            # Dutch (primary)
└── nl-NL.json         # Dutch (duplicate for compatibility)
```

Example translation key:
```json
{
  "priceelephant": {
    "homepage": {
      "hero": {
        "title": "Win altijd op prijs",
        "subtitle": "Monitor concurrenten automatisch..."
      }
    }
  }
}
```

---

## 🌐 Part 3: Domain Setup

### Current Setup
- **Development**: `priceelephant.myshopify.com`
- **Goal**: `priceelephant.com` with language paths

### Connect Custom Domain

#### Step 1: Domain Connection in Shopify

1. Go to **Shopify Admin** → **Settings** → **Domains**
2. Click on **Connect existing domain**
3. Enter: `priceelephant.com`
4. Click **Next**

#### Step 2: DNS Configuration

Add these DNS records in your domain provider:

```
Type: CNAME
Host: www
Value: shops.myshopify.com

Type: A
Host: @
Value: 23.227.38.65

Type: A  
Host: @
Value: 23.227.38.66

Type: A
Host: @
Value: 23.227.38.67

Type: A
Host: @
Value: 23.227.38.68
```

#### Step 3: SSL Certificate

1. Wait 24-48 hours for DNS propagation
2. Shopify automatically provisions SSL certificate
3. Verify HTTPS works on `https://priceelephant.com`

### Language URL Structure

After domain setup:

```
https://priceelephant.com/          # Dutch (default)
https://priceelephant.com/en        # English
```

### Verification Steps

1. ✅ `priceelephant.com` redirects to Shopify
2. ✅ SSL certificate active (green lock)
3. ✅ `/nl` and `/en` URLs work
4. ✅ Language switcher functional
5. ✅ Content displays in correct language

---

## 🧪 Testing

### API Testing

```bash
# Test product creation
curl -X POST https://priceelephant.myshopify.com/admin/api/2023-10/products.json \
  -H "X-Shopify-Access-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product": {
      "title": "Test Product",
      "vendor": "PriceElephant",
      "product_type": "Test"
    }
  }'
```

### Language Testing

1. Visit `https://priceelephant.myshopify.com/`
2. Check if Dutch content displays
3. Switch to `/en` for English
4. Verify all translation keys work

### Domain Testing

1. Visit `https://priceelephant.com`
2. Verify redirect to Shopify works
3. Test SSL certificate
4. Check language URLs

---

## 🚨 Troubleshooting

### Common Issues

**App Installation Failed**
- Check if you have admin permissions
- Verify Shopify plan supports custom apps

**Translation Keys Missing**
- Check `locales/nl.json` for missing keys
- Verify Liquid template syntax: `{{ 'key' | t }}`
- Arrays should be pipe-separated: `"item1||item2||item3"`

**Domain Not Working**
- Verify DNS records are correct
- Wait 24-48 hours for propagation
- Check domain provider settings

**SSL Issues**
- Ensure domain is properly connected
- Wait for Shopify SSL provisioning
- Check for mixed content warnings

### Support

For additional help:
- **Shopify Help Center**: https://help.shopify.com
- **Developer Docs**: https://shopify.dev
- **Community**: https://community.shopify.com

---

**Setup Complete!** 🎉

Your Shopify store is now configured with:
- ✅ Custom App with API access
- ✅ Multi-language support (Dutch/English)  
- ✅ Custom domain setup
- ✅ SSL certificate
- ✅ Theme translations