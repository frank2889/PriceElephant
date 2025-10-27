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

# Method 1: Try git subtree push with timeout
echo "Attempting git subtree push (30s timeout)..."
if timeout 30s git subtree push --prefix=theme origin shopify-theme 2>/dev/null; then
    echo -e "${GREEN}✅ Subtree push successful${NC}"
else
    echo -e "${BLUE}⚠️  Subtree push timeout/failed, using split method...${NC}"
    
    # Method 2: Fallback to split + push (more reliable)
    SPLIT_BRANCH="theme-temp-$(date +%s)"
    git subtree split --prefix=theme -b $SPLIT_BRANCH
    git push -f origin $SPLIT_BRANCH:shopify-theme
    git branch -D $SPLIT_BRANCH
    
    echo -e "${GREEN}✅ Split method successful${NC}"
fi

echo ""
echo -e "${GREEN}✅ Theme synced successfully!${NC}"
echo -e "${GREEN}🎨 Shopify will auto-deploy within 1-2 minutes${NC}"
echo ""
echo "Next steps:"
echo "  1. Check Shopify Admin → Online Store → Themes"
echo "  2. Wait for GitHub sync to complete"
echo "  3. Preview changes on priceelephant.myshopify.com"
