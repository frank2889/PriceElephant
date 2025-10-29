#!/bin/bash
# Fast theme sync - direct push without git subtree
set -e

echo "🐘 Fast Theme Sync"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "📦 Copying theme files to temp directory..."
cp -r theme/* "$TEMP_DIR/"

# Clone shopify-theme branch
CLONE_DIR=$(mktemp -d)
echo "📥 Cloning shopify-theme branch..."
git clone --branch shopify-theme --single-branch https://github.com/frank2889/PriceElephant.git "$CLONE_DIR" 2>/dev/null

# Copy files over
echo "📝 Updating files..."
rsync -av --delete "$TEMP_DIR/" "$CLONE_DIR/"

# Push changes
cd "$CLONE_DIR"
git add -A
if git diff --staged --quiet; then
    echo "✅ No changes to sync"
else
    echo "🚀 Pushing changes..."
    git commit -m "Update theme files from main"
    git push origin shopify-theme
    echo "✅ Theme synced successfully!"
fi

# Cleanup
cd /
rm -rf "$TEMP_DIR" "$CLONE_DIR"

echo "🎨 Shopify will auto-deploy within 1-2 minutes"
