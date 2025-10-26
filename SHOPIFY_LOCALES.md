# Shopify Multi-Language Setup

## Configuratie

PriceElephant ondersteunt meerdere talen via Shopify's native internationalisatie.

### Beschikbare talen:
- 🇬🇧 **Engels** (default) - `en` - https://priceelephant.myshopify.com/
- 🇳🇱 **Nederlands** - `nl` - https://priceelephant.myshopify.com/nl

---

## Shopify Admin Configuratie

### 1. Activeer Markets & Languages

1. Ga naar **Shopify Admin** → **Settings** → **Markets**
2. Klik op **Preferences**
3. Enable **International domains and languages**

### 2. Voeg Nederlandse markt toe

1. Ga naar **Markets** → **Add market**
2. Naam: **Netherlands**
3. Countries/regions: Selecteer **Netherlands**
4. Languages: Voeg **Dutch (nl)** toe
5. Currency: **EUR (€)**
6. Save

### 3. Configureer URL structure

#### Optie A: Subpath (aanbevolen)
- Default (EN): `priceelephant.myshopify.com`
- Nederlands: `priceelephant.myshopify.com/nl`

#### Optie B: Subdomain
- Default (EN): `priceelephant.myshopify.com`
- Nederlands: `nl.priceelephant.myshopify.com`

#### Optie C: Custom domain
- Default (EN): `priceelephant.com`
- Nederlands: `priceelephant.nl`

**Voor Nederland starten we met Optie A (subpath).**

### 4. Vertalingen activeren

1. Ga naar **Settings** → **Languages**
2. Klik op **Translate & adapt**
3. Selecteer **Dutch (nl)**
4. Theme translations worden automatisch geladen uit:
   - `theme/locales/nl.json` (Nederlands)
   - `theme/locales/en.default.json` (Engels fallback)

---

## Theme Structure

### Locale Files

```
theme/
├── locales/
│   ├── en.default.json    # Engels (default/fallback)
│   └── nl.json            # Nederlands
```

### Template Usage

```liquid
<!-- Simple translation -->
<h1>{{ 'priceelephant.homepage.hero.title' | t }}</h1>

<!-- Translation with variable -->
<p>{{ 'priceelephant.homepage.hero.welcome_back' | t: name: customer.first_name }}</p>

<!-- Array splitting (for pricing features) -->
{% for feature in (0..4) %}
  <li>{{ 'priceelephant.homepage.pricing.trial.features' | t | split: '||' | slice: feature }}</li>
{% endfor %}
```

### JavaScript i18n

```liquid
<script>
  window.TRANSLATIONS = {
    title: {{ 'priceelephant.dashboard.title' | t | json }},
    loading: {{ 'priceelephant.dashboard.loading' | t | json }}
  };
</script>
```

---

## Language Switcher (Toekomstig)

Voeg toe aan `theme/sections/header.liquid`:

```liquid
{% if localization.available_languages.size > 1 %}
  <div class="language-switcher">
    <form action="{{ routes.cart_update_url }}" method="post">
      <select name="locale_code" onchange="this.form.submit()">
        {% for language in localization.available_languages %}
          <option 
            value="{{ language.iso_code }}" 
            {% if language.iso_code == localization.language.iso_code %}selected{% endif %}
          >
            {{ language.endonym_name }}
          </option>
        {% endfor %}
      </select>
    </form>
  </div>
{% endif %}
```

---

## Testing

### 1. Test locale switching

```bash
# Default (EN)
open https://priceelephant.myshopify.com/

# Nederlands
open https://priceelephant.myshopify.com/nl
```

### 2. Verify translations

- Check homepage hero title:
  - EN: "Never lose on price again"
  - NL: "Win altijd op prijs"

- Check pricing:
  - EN: "Start free trial"
  - NL: "Start gratis trial"

### 3. Test customer account

- Login/logout links
- Account dropdown menu
- Dashboard translations

---

## Uitbreiden met nieuwe talen

### 1. Voeg locale file toe

Kopieer `nl.json` naar nieuwe taal:

```bash
cp theme/locales/nl.json theme/locales/de.json
```

### 2. Vertaal alle strings

Open `de.json` en vertaal:

```json
{
  "priceelephant": {
    "homepage": {
      "hero": {
        "title": "Nie wieder bei Preisen verlieren",
        "subtitle": "Konkurrenten überwachen. Trends verfolgen. Preise optimieren.",
        ...
      }
    }
  }
}
```

### 3. Activeer in Shopify Admin

1. **Settings** → **Languages**
2. Voeg **German (de)** toe
3. **Markets** → Create German market
4. Test op `priceelephant.myshopify.com/de`

---

## Content Strategie per Markt

### Nederland (NL)
- **Target**: Nederlandse e-commerce bedrijven
- **Tone**: Professioneel maar toegankelijk
- **Examples**: Coolblue, Bol.com, MediaMarkt
- **Currency**: EUR (€)
- **Payment**: iDEAL, creditcard

### België (Mogelijk toekomstig)
- Same as NL maar met Belgische retailers
- Currency: EUR (€)
- Payment: Bancontact, iDEAL

### UK/EU (English)
- **Target**: International businesses
- **Examples**: Amazon, eBay
- **Currency**: EUR/GBP (multi-currency)
- **Payment**: Credit card, SEPA

---

## SEO per Taal

### hreflang Tags

Voeg toe aan `theme/layout/theme.liquid`:

```liquid
<link rel="alternate" hreflang="en" href="https://priceelephant.com/" />
<link rel="alternate" hreflang="nl" href="https://priceelephant.com/nl" />
<link rel="alternate" hreflang="x-default" href="https://priceelephant.com/" />
```

### Meta Descriptions

Per taal verschillende meta descriptions in locale files:

```json
{
  "meta": {
    "homepage": {
      "title": "PriceElephant - Win altijd op prijs | Concurrent prijsmonitoring",
      "description": "Monitor concurrent prijzen 24/7. AI-powered scraping voor Nederlandse webshops. Start gratis."
    }
  }
}
```

---

## Troubleshooting

### "Translations not showing"
- Check if locale file exists in `theme/locales/`
- Verify JSON syntax (no trailing commas!)
- Clear Shopify theme cache

### "Wrong language showing"
- Check URL includes `/nl` for Dutch
- Verify language is activated in Shopify Admin
- Check browser language settings

### "Missing translation key"
- Falls back to `en.default.json`
- Check key exists in both files
- Verify exact key path (case-sensitive)

---

## Roadmap

- [x] Nederlands (nl) - Live
- [x] Engels (en) - Default
- [ ] Duits (de) - Q1 2026
- [ ] Frans (fr) - Q2 2026
- [ ] Spaans (es) - Q3 2026

---

## Support

Voor vragen over vertalingen of nieuwe talen:
- **Email**: support@priceelephant.com
- **Docs**: https://priceelephant.com/docs/i18n
