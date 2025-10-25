# Shopify Custom App Setup Instructions

Om de Shopify Admin API te gebruiken, moet je een **Custom App** aanmaken in je Shopify store.

## Stap 1: Custom App aanmaken

1. Ga naar Shopify Admin: https://admin.shopify.com/store/priceelephant
2. Ga naar **Settings** → **Apps and sales channels**
3. Klik op **Develop apps**
4. Klik op **Create an app**
5. App naam: `PriceElephant Backend`
6. Klik op **Create app**

## Stap 2: API Scopes configureren

1. Klik op **Configure Admin API scopes**
2. Selecteer de volgende scopes:

### Product Scopes:
- ✅ `read_products`
- ✅ `write_products`

### Customer Scopes:
- ✅ `read_customers`
- ✅ `write_customers`

### Order Scopes (optioneel voor later):
- ✅ `read_orders`

3. Klik op **Save**

## Stap 3: Access Token genereren

1. Ga naar het **API credentials** tabblad
2. Klik op **Install app**
3. Klik op **Install** (bevestig de permissies)
4. Klik op **Reveal token once** 
5. **KOPIEER DE TOKEN NU** (je kunt hem maar 1x zien!)

## Stap 4: Credentials toevoegen aan .env

Open `/backend/.env` en voeg toe:

```bash
# Shopify Store Access
SHOPIFY_SHOP_DOMAIN=priceelephant.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Shopify API Key (van Custom App)
SHOPIFY_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Je vindt de API Key en Secret in het **API credentials** tabblad van je Custom App.

## Stap 5: Test de connectie

```bash
cd backend
node services/shopify-sync.js
```

Je zou moeten zien:
```
✅ Connected to Shopify!
   Shop: PriceElephant
   Domain: priceelephant.myshopify.com
   Email: your@email.com
```

## Stap 6: Sync je eerste producten naar Shopify

```bash
# Test via API
curl -X POST http://localhost:3000/api/v1/shopify/test

# Sync producten voor customer 1
curl -X POST http://localhost:3000/api/v1/shopify/sync \
  -H "Content-Type: application/json" \
  -d '{"customerId": 1, "limit": 3}'

# Check sync status
curl http://localhost:3000/api/v1/shopify/status/1
```

## API Endpoints

### `POST /api/v1/shopify/sync`
Sync een batch producten naar Shopify
```json
{
  "customerId": 1,
  "limit": 10
}
```

### `POST /api/v1/shopify/sync-all`
Sync ALLE producten (background proces)
```json
{
  "customerId": 1
}
```

### `POST /api/v1/shopify/sync-prices/:productId`
Update competitor prijzen voor 1 product

### `GET /api/v1/shopify/status/:customerId`
Bekijk sync status

### `GET /api/v1/shopify/test`
Test Shopify connectie

## Metafields

De app maakt automatisch metafields aan:

### Product Metafields (`priceelephant` namespace):
- `channable_id` - External ID van Channable
- `ean` - Product EAN barcode
- `competitor_prices` - JSON met concurrent prijzen:
  ```json
  {
    "coolblue": {
      "price": 1159.00,
      "inStock": true,
      "scrapedAt": "2025-10-25T12:00:00Z"
    },
    "bol.com": {
      "price": 1149.00,
      "inStock": true,
      "scrapedAt": "2025-10-25T12:00:00Z"
    }
  }
  ```

## Rate Limiting

Shopify heeft rate limits:
- **REST API**: 2 requests per second (500ms delay tussen calls)
- **GraphQL API**: 50 points per second (voor later)

De sync service respecteert automatisch deze limits.

## Troubleshooting

### "Invalid access token"
- Check of `SHOPIFY_ACCESS_TOKEN` correct is
- Token moet beginnen met `shpat_`
- Token is maar 1x zichtbaar, maak eventueel nieuwe app

### "API permission denied"
- Check of je de juiste scopes hebt geselecteerd
- Herinstalleer de app na scope wijzigingen

### "Shop domain not found"
- `SHOPIFY_SHOP_DOMAIN` moet zijn: `priceelephant.myshopify.com`
- NIET: `https://` of `/admin`

## Security

⚠️ **BELANGRIJK**: 
- Voeg `.env` toe aan `.gitignore` (already done)
- Deel je access token NOOIT in code of commits
- Roteer tokens regelmatig (maak nieuwe Custom App)
