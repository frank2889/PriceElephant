# Shopify Theme Auto-Deploy Setup

Deze GitHub Action pusht automatisch theme wijzigingen naar Shopify bij elke commit naar `main`.

## Setup Instructies

### 1. Genereer Shopify Theme Access Token

1. Ga naar **Shopify Admin** → **Settings** → **Apps and sales channels**
2. Klik op **Develop apps** → **Create an app**
3. Geef de app een naam: "GitHub Theme Deploy"
4. Ga naar **Configuration** → **Theme templates and theme assets**
5. Klik **Configure** en selecteer: **Read and write** access
6. Klik **Save**
7. Ga naar **API credentials** → **Install app**
8. Kopieer de **Admin API access token**

### 2. Vind je Theme ID

**Optie A: Via Shopify CLI (lokaal)**
```bash
shopify theme list
```

**Optie B: Via URL**
1. Ga naar **Shopify Admin** → **Online Store** → **Themes**
2. Klik op je actieve theme → **Edit code**
3. De URL ziet er zo uit: `https://admin.shopify.com/store/STORE_NAME/themes/THEME_ID/editor`
4. Kopieer het `THEME_ID` nummer

**Optie C: Via browser inspect**
1. Ga naar Themes pagina
2. Right-click op theme → Inspect element
3. Zoek naar `data-theme-id="123456789"`

### 3. Voeg GitHub Secrets toe

1. Ga naar **GitHub** → je repo → **Settings** → **Secrets and variables** → **Actions**
2. Klik **New repository secret** en voeg toe:

   - **Name:** `SHOPIFY_CLI_THEME_TOKEN`
     **Value:** [de Admin API access token van stap 1]

   - **Name:** `SHOPIFY_SHOP`
     **Value:** `priceelephant.myshopify.com`

   - **Name:** `SHOPIFY_THEME_ID`
     **Value:** [het theme ID van stap 2]

### 4. Test de workflow

1. Maak een kleine wijziging in een theme file (bijv. voeg een comment toe)
2. Commit en push naar main:
   ```bash
   git add theme/
   git commit -m "Test auto-deploy"
   git push
   ```
3. Ga naar **GitHub** → **Actions** tab
4. Je ziet de workflow draaien
5. Check Shopify theme editor - wijziging zou binnen 1-2 minuten live moeten zijn

## Hoe het werkt

- Workflow triggert alleen bij wijzigingen in `theme/` directory
- Gebruikt `shopify theme push` commando
- `--nodelete` flag voorkomt dat files worden verwijderd
- `--allow-live` flag staat push naar live theme toe
- Deployment duurt ~30-60 seconden

## Troubleshooting

**Error: "Theme not found"**
→ Check of SHOPIFY_THEME_ID correct is

**Error: "Authentication failed"**
→ Check of SHOPIFY_CLI_THEME_TOKEN correct is en voldoende permissions heeft

**Error: "Store not found"**
→ Check of SHOPIFY_SHOP correct formaat heeft (met .myshopify.com)

**Workflow triggert niet**
→ Check of je wijzigingen in `theme/` directory hebt gemaakt
