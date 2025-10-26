# Shopify Domain Setup Guide

## Probleem
Je wilt:
- **priceelephant.com** → Engels (default)
- **priceelephant.com/nl-nl** → Nederlands

Maar Shopify gebruikt nu `priceelephant.myshopify.com`.

---

## Oplossing: Custom Domain Koppelen

### Stap 1: Domain Koppelen in Shopify

1. Ga naar **Shopify Admin** → **Settings** → **Domains**
2. Klik op **Connect existing domain**
3. Vul in: `priceelephant.com`
4. Klik **Next**

### Stap 2: DNS Configuratie

Shopify geeft je 2 opties:

#### Optie A: A Record (Aanbevolen)
Voeg deze DNS records toe bij je domain provider:

```
Type: A
Name: @
Value: 23.227.38.65
TTL: Auto/3600
```

#### Optie B: CNAME
```
Type: CNAME
Name: www
Value: shops.myshopify.com
TTL: Auto/3600
```

**Let op:** Je kunt GEEN CNAME op root domain (@) zetten. Gebruik A record voor `priceelephant.com`.

### Stap 3: Wacht op Propagatie
- DNS propagatie kan 24-48 uur duren
- Check status in Shopify Admin → Domains
- Groen vinkje = klaar

---

## Language/Market Setup

### Stap 4: Configureer Markets

1. **Settings** → **Markets**
2. Je hebt al "Netherlands" market (actief)
3. Klik op **Netherlands**
4. Onder "Domains and languages":
   - Domain: `priceelephant.com` (inherited)
   - Subfolders: **Dutch** → `/nl-nl`

### Stap 5: Primary Market (Engels)

1. Klik op **International** (of maak aan)
2. Regions: **Rest of World** of specifiek **United Kingdom, United States, etc.**
3. Language: **English**
4. Domain: `priceelephant.com` (root)

---

## Verwachte URL Structuur

Na setup:

| Market | Language | URL |
|--------|----------|-----|
| International (Primary) | English | `priceelephant.com/` |
| Netherlands | Dutch | `priceelephant.com/nl-nl/` |

**Let op:** Shopify voegt automatisch `/nl-nl/` toe (language code + country code).

---

## Alternatief: Alleen `/nl` gebruiken

Als je `/nl` wilt ipv `/nl-nl`:

### Optie: Custom Language Prefix

Helaas kan Shopify dit niet aanpassen. Het gebruikt altijd: `/{language-code}-{country-code}/`

**Workaround met Shopify Scripts (niet aanbevolen):**
- Gebruik liquid redirects
- Maar dit breekt SEO en is hacky

**Beste oplossing:** Accepteer `/nl-nl/` als standaard.

---

## DNS Provider Specifieke Instructies

### Cloudflare
1. DNS → Add record
2. Type: **A**
3. Name: **@**
4. IPv4: **23.227.38.65**
5. Proxy: **Orange cloud** (proxied)
6. Save

### GoDaddy
1. DNS Management
2. Add → **A Record**
3. Host: **@**
4. Points to: **23.227.38.65**
5. TTL: **1 Hour**
6. Save

### TransIP (Nederlands)
1. Domeinen → priceelephant.com → DNS
2. Add → **A**
3. Naam: **@**
4. Waarde: **23.227.38.65**
5. TTL: **3600**
6. Opslaan

---

## SSL Certificate

Shopify genereert automatisch gratis SSL via Let's Encrypt:

1. Na DNS propagatie (24-48u)
2. Shopify detecteert domain automatisch
3. SSL certificate wordt gegenereerd
4. HTTPS wordt geforceerd

**Check:** `https://priceelephant.com` → moet werken zonder waarschuwing

---

## Testen

### Stap 1: Check DNS Propagatie

```bash
# Check A record
dig priceelephant.com

# Should show:
# priceelephant.com.  IN  A  23.227.38.65
```

### Stap 2: Test URLs

```bash
# Engels (default)
open https://priceelephant.com/

# Nederlands
open https://priceelephant.com/nl-nl/
```

### Stap 3: Verify Translations

- Bezoek `priceelephant.com/` → Engels ("Never lose on price again")
- Bezoek `priceelephant.com/nl-nl/` → Nederlands ("Win altijd op prijs")

---

## Troubleshooting

### "Domain not verified"
- Wacht 24-48 uur voor DNS propagatie
- Check DNS records bij provider
- Gebruik `dig priceelephant.com` om te verifiëren

### "SSL pending"
- Wacht tot DNS propagatie compleet is
- Shopify genereert SSL automatisch
- Check "SSL unavailable" → dit is normaal tijdens setup

### "/nl-nl/ werkt niet"
1. Check "Netherlands" market is **Active**
2. Verify Dutch is toegevoegd als language
3. Check `theme/locales/nl.json` bestaat
4. Clear browser cache + Shopify cache

### "Redirects to .myshopify.com"
- Primary domain nog niet ingesteld
- Ga naar Domains → Set `priceelephant.com` as **Primary**

---

## Redirect Setup (Optioneel)

### www → non-www

Shopify handelt dit automatisch af als je:
1. Beide domains toevoegt (`priceelephant.com` + `www.priceelephant.com`)
2. Primary domain instelt op `priceelephant.com`

### .myshopify.com → .com

Automatisch door Shopify zodra primary domain is ingesteld.

---

## SEO Overwegingen

### hreflang Tags

Voeg toe aan `theme/layout/theme.liquid` (na `<head>`):

```liquid
{% if request.locale.iso_code == 'nl' %}
  <link rel="alternate" hreflang="en" href="https://priceelephant.com{{ request.path }}" />
  <link rel="alternate" hreflang="nl-NL" href="https://priceelephant.com/nl-nl{{ request.path }}" />
  <link rel="alternate" hreflang="x-default" href="https://priceelephant.com{{ request.path }}" />
{% else %}
  <link rel="alternate" hreflang="en" href="https://priceelephant.com{{ request.path }}" />
  <link rel="alternate" hreflang="nl-NL" href="https://priceelephant.com/nl-nl{{ request.path }}" />
  <link rel="alternate" hreflang="x-default" href="https://priceelephant.com{{ request.path }}" />
{% endif %}
```

### Sitemap

Shopify genereert automatisch per language:
- `priceelephant.com/sitemap.xml` (EN)
- `priceelephant.com/nl-nl/sitemap.xml` (NL)

---

## Checklist

- [ ] Custom domain gekoppeld (`priceelephant.com`)
- [ ] DNS A record ingesteld (23.227.38.65)
- [ ] DNS propagatie compleet (24-48u)
- [ ] SSL certificate actief (groen slot)
- [ ] Primary domain ingesteld
- [ ] Netherlands market actief
- [ ] Dutch language `/nl-nl/` geconfigureerd
- [ ] Translations werken (test beide URLs)
- [ ] hreflang tags toegevoegd
- [ ] Redirects getest (www, .myshopify.com)

---

## Support

Als je vastloopt:
1. Check Shopify Admin → Domains → Status
2. Gebruik `dig priceelephant.com` om DNS te checken
3. Clear cache (browser + Shopify)
4. Wacht 48u voor DNS propagatie

**Shopify Docs:**
- [Custom domains](https://help.shopify.com/en/manual/domains)
- [International selling](https://help.shopify.com/en/manual/markets)
- [Multiple languages](https://help.shopify.com/en/manual/markets/languages)
