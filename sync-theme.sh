#!/bin/bash
# Sync theme/ folder to shopify-theme branch
# Usage: ./sync-theme.sh "commit message"

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐘 PriceElephant Theme Sync${NC}"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}❌ Error: You must be on 'main' branch${NC}"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Error: You have uncommitted changes${NC}"
    echo "Please commit or stash your changes first"
    exit 1
fi

# Get commit message
COMMIT_MSG="${1:-Update theme files}"

echo -e "${BLUE}📝 Commit message:${NC} $COMMIT_MSG"
echo ""

# Push theme/ folder to shopify-theme branch
echo -e "${BLUE}🚀 Syncing theme/ to shopify-theme branch...${NC}"

# Simple method: checkout shopify-theme, copy files, commit, push
echo "Switching to shopify-theme branch..."

# Stash current changes (if any)
git stash save "temp-stash-before-theme-sync" >/dev/null 2>&1 || true

# Checkout or create shopify-theme branch
if git show-ref --verify --quiet refs/heads/shopify-theme; then
    git checkout shopify-theme
else
    git checkout --orphan shopify-theme
    git rm -rf . >/dev/null 2>&1 || true
fi

# Pull latest from remote (if exists)
git pull origin shopify-theme --rebase 2>/dev/null || true

# Copy theme files from main
echo "Copying theme files..."
git checkout main -- theme/
mv theme/* . 2>/dev/null || true
rmdir theme 2>/dev/null || true

# Commit and push
echo "Committing changes..."
git add -A
if git diff --staged --quiet; then
    echo "No changes to sync"
else
    git commit -m "$COMMIT_MSG"
    echo "Pushing to origin..."
    git push -f origin shopify-theme
fi

# Return to main branch
echo "Returning to main branch..."
git checkout main

# Restore stash if exists
git stash pop >/dev/null 2>&1 || true

echo ""
echo -e "${GREEN}✅ Theme synced successfully!${NC}"
echo -e "${GREEN}🎨 Shopify will auto-deploy within 1-2 minutes${NC}"
echo ""
echo "Next steps:"
echo "  1. Check Shopify Admin → Online Store → Themes"
echo "  2. Wait for GitHub sync to complete"
echo "  3. Preview changes on priceelephant.myshopify.com"
