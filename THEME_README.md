# Shopify Theme Files

⚠️ **BELANGRIJK: Theme files staan NIET in de main branch**

## Locatie van theme files

Alle Shopify theme files (templates, assets, locales, sections, etc.) staan in de **`shopify-theme` branch**.

```bash
# Bekijk theme files:
git checkout shopify-theme

# Terug naar main:
git checkout main
```

## Deployment

De `shopify-theme` branch is gekoppeld aan GitHub → Shopify auto-sync:

1. Push naar `shopify-theme` branch
2. Shopify detecteert wijzigingen automatisch
3. Theme wordt binnen 1-2 minuten geüpdatet op priceelephant.myshopify.com

## Branch structuur

- **main branch**: Backend API, database, scripts, documentatie
- **shopify-theme branch**: Shopify Liquid templates, assets, locales

## Waarom gescheiden?

De main branch bevat een `/backend` folder structuur. Shopify verwacht theme files in de root. Door de theme in een aparte branch te houden, kunnen beide systemen hun eigen folderstructuur behouden zonder conflicts.

## Theme bewerken

```bash
# 1. Switch naar theme branch
git checkout shopify-theme

# 2. Maak wijzigingen in locales/, templates/, assets/, etc.

# 3. Commit en push
git add .
git commit -m "feat: Update homepage"
git push origin shopify-theme

# 4. Terug naar main
git checkout main
```

## Links

- Live theme: https://priceelephant.myshopify.com
- GitHub shopify-theme branch: https://github.com/frank2889/PriceElephant/tree/shopify-theme
- Theme editor: Shopify Admin → Online Store → Themes
