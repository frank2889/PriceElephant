# 🎨 Theme Development Workflow

## Overzicht

We gebruiken **git subtree** om de `/theme` folder automatisch te syncen naar de `shopify-theme` branch.

### Repository Structuur

```
PriceElephant/
├── backend/              # Express API, database, scraping
├── theme/                # ← Shopify theme (werk hier!)
│   ├── assets/
│   ├── config/
│   ├── layout/
│   ├── locales/
│   ├── sections/
│   └── templates/
├── sync-theme.sh         # Helper script
└── ...
```

### GitHub Branches

- **`main`**: Complete project (backend + theme folder)
- **`shopify-theme`**: ALLEEN theme files in root (auto-sync naar Shopify)

---

## 🚀 Dagelijkse Workflow

### 1. Theme bewerken

Werk gewoon in de `/theme` folder:

```bash
# Bewerk files in theme/
code theme/locales/nl.json
code theme/templates/index.liquid
code theme/assets/priceelephant-dashboard.css
```

### 2. Commit naar main

```bash
git add theme/
git commit -m "feat: Update homepage hero section"
git push origin main
```

### 3. Sync naar Shopify

**Optie A: Met helper script (aanbevolen)**
```bash
./sync-theme.sh
```

**Optie B: Handmatig**
```bash
git subtree push --prefix=theme origin shopify-theme
```

### 4. Check deployment

1. Ga naar **Shopify Admin** → **Online Store** → **Themes**
2. Zie GitHub sync status (1-2 minuten)
3. Preview op priceelephant.myshopify.com

---

## 📋 Veelvoorkomende Scenario's

### Nieuwe feature toevoegen

```bash
# 1. Werk in theme/
code theme/sections/new-feature.liquid

# 2. Test lokaal (optioneel)
shopify theme dev

# 3. Commit + sync
git add theme/
git commit -m "feat: Add new feature section"
git push origin main
./sync-theme.sh
```

### Translations updaten

```bash
# 1. Bewerk nl.json
code theme/locales/nl.json

# 2. Commit + sync
git add theme/locales/nl.json
git commit -m "i18n: Update Dutch translations"
git push origin main
./sync-theme.sh
```

### CSS/JS aanpassen

```bash
# 1. Bewerk assets
code theme/assets/priceelephant-dashboard.css
code theme/assets/priceelephant-dashboard.js

# 2. Commit + sync
git add theme/assets/
git commit -m "style: Update dashboard styling"
git push origin main
./sync-theme.sh
```

---

## ⚠️ Belangrijke Regels

### ✅ DO

- Werk **altijd** in de `/theme` folder op `main` branch
- Commit naar `main` eerst, dan sync naar `shopify-theme`
- Run `./sync-theme.sh` na elke theme update
- Test changes op Shopify preview voordat je live gaat

### ❌ DON'T

- **NOOIT** handmatig de `shopify-theme` branch checkouten
- **NOOIT** direct in `shopify-theme` branch werken
- **NOOIT** theme files buiten `/theme` folder plaatsen
- **NOOIT** `git push --force` op `shopify-theme` gebruiken

---

## 🔧 Troubleshooting

### "Updates were rejected" error

Dit gebeurt als Shopify wijzigingen heeft gemaakt:

```bash
# Haal Shopify updates op
git fetch origin shopify-theme

# Force sync (gebruik met voorzichtigheid!)
git push origin :shopify-theme
git subtree push --prefix=theme origin shopify-theme
```

### Theme files verdwenen

Check of je op de juiste branch zit:

```bash
git branch --show-current  # Moet 'main' zijn
ls -la theme/              # Moet alle folders tonen
```

Herstel vanaf GitHub:

```bash
git checkout main
git reset --hard origin/main
```

### Shopify sync werkt niet

1. Check GitHub → Shopify connectie in Shopify Admin
2. Verifieer dat de theme gekoppeld is aan `shopify-theme` branch
3. Kijk naar recent commits op GitHub

---

## 📚 Achtergrond: Waarom git subtree?

**Probleem**: Shopify verwacht theme files in **root** van de branch, maar ons project heeft ook backend code.

**Oplossing**: 
- `main` branch = backend + theme folder
- `shopify-theme` branch = alleen theme files in root
- `git subtree` = sync theme/ naar shopify-theme automatisch

**Voordelen**:
- ✅ Eén repository voor alles
- ✅ Backend en theme gescheiden
- ✅ Shopify auto-deploy blijft werken
- ✅ Geen handmatige file kopiëren

---

## 🔗 Links

- **Shopify Admin**: https://priceelephant.myshopify.com/admin
- **GitHub Repo**: https://github.com/frank2889/PriceElephant
- **Main Branch**: https://github.com/frank2889/PriceElephant/tree/main
- **Shopify Theme Branch**: https://github.com/frank2889/PriceElephant/tree/shopify-theme

---

**Hulp nodig?** Check `./sync-theme.sh --help` of vraag Frank
