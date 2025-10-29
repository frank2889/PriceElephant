#!/bin/bash
# Sync theme/ folder to shopify-theme branch
# STAYS ON MAIN BRANCH - uses git subtree push

set -e

echo "🐘 PriceElephant Theme Sync"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: You must be on 'main' branch"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes"
    echo "Please commit or stash your changes first"
    exit 1
fi

echo "🚀 Syncing theme/ to shopify-theme branch..."
echo "(This stays on main branch and uses git subtree push)"
echo ""

# Simple git subtree push - NO branch switching!
git subtree push --prefix=theme origin shopify-theme

echo ""
echo "✅ Theme synced successfully!"
echo "🎨 Shopify will auto-deploy within 1-2 minutes"

