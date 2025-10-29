#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Building BabyTools Extension...${NC}"

# Get the extension name and version from package.json
EXTENSION_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
BUILD_NAME="${EXTENSION_NAME}-v${VERSION}"

# Create build directory if not exists
BUILD_DIR="./build"
mkdir -p "$BUILD_DIR"

# Temporary directory for staging files
TEMP_DIR="$BUILD_DIR/temp"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/$EXTENSION_NAME"

echo -e "${YELLOW}📦 Copying files...${NC}"

# Copy necessary files
rsync -av --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='build' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='.gitignore' \
  --exclude='build.sh' \
  --exclude='*.backup' \
  --exclude='*.bak' \
  --exclude='*.tmp' \
  --exclude='*.temp' \
  ./ "$TEMP_DIR/$EXTENSION_NAME/"

# Install production dependencies only (no dev dependencies)
echo -e "${YELLOW}📥 Installing production dependencies...${NC}"
cd "$TEMP_DIR/$EXTENSION_NAME"
npm install --production --silent
cd - > /dev/null

# Create zip file
echo -e "${YELLOW}🗜️  Creating zip file...${NC}"
cd "$TEMP_DIR"
ZIP_FILE="$BUILD_NAME.zip"
zip -r "$ZIP_FILE" "$EXTENSION_NAME" -q

# Move zip to build directory
mv "$ZIP_FILE" "../$ZIP_FILE"
cd - > /dev/null

# Clean up temp directory
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✅ Build complete!${NC}"
echo -e "${GREEN}📦 Output: ${BUILD_DIR}/${ZIP_FILE}${NC}"
echo -e "${GREEN}🎉 Ready to distribute!${NC}"
