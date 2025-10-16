#!/bin/bash

# WRC Coach Release Script
# This script helps create a new release with proper versioning

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the version from package.json
PACKAGE_VERSION=$(node -p "require('./package.json').version")

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}     WRC Coach Release Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Working directory is not clean!${NC}"
    echo -e "${YELLOW}Please commit or stash your changes first.${NC}"
    git status --short
    exit 1
fi

echo -e "${GREEN}✅ Working directory is clean${NC}"
echo ""

# Show current version
echo -e "${BLUE}Current version:${NC} v${PACKAGE_VERSION}"
echo ""

# Ask for version type or custom version
echo -e "${YELLOW}How do you want to bump the version?${NC}"
echo "  1) patch (${PACKAGE_VERSION} -> $(npm version patch --no-git-tag-version --preid=beta | tail -1 && npm version ${PACKAGE_VERSION} --no-git-tag-version))"
echo "  2) minor (${PACKAGE_VERSION} -> $(npm version minor --no-git-tag-version --preid=beta | tail -1 && npm version ${PACKAGE_VERSION} --no-git-tag-version))"
echo "  3) major (${PACKAGE_VERSION} -> $(npm version major --no-git-tag-version --preid=beta | tail -1 && npm version ${PACKAGE_VERSION} --no-git-tag-version))"
echo "  4) custom version"
echo "  5) use current version (${PACKAGE_VERSION})"
echo ""
read -p "Enter choice [1-5]: " VERSION_CHOICE

case $VERSION_CHOICE in
    1)
        NEW_VERSION=$(npm version patch --no-git-tag-version)
        ;;
    2)
        NEW_VERSION=$(npm version minor --no-git-tag-version)
        ;;
    3)
        NEW_VERSION=$(npm version major --no-git-tag-version)
        ;;
    4)
        read -p "Enter new version (without 'v' prefix): " CUSTOM_VERSION
        NEW_VERSION=$(npm version ${CUSTOM_VERSION} --no-git-tag-version)
        ;;
    5)
        NEW_VERSION="v${PACKAGE_VERSION}"
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Extract version number (remove 'v' prefix if present)
VERSION_NUMBER=$(echo ${NEW_VERSION} | sed 's/^v//')

echo ""
echo -e "${GREEN}New version will be:${NC} v${VERSION_NUMBER}"
echo ""

# Ask for release notes
echo -e "${YELLOW}Enter release notes (press Ctrl+D when done):${NC}"
RELEASE_NOTES=$(cat)

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Creating Release v${VERSION_NUMBER}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Generate version.json
echo -e "${BLUE}📝 Generating version.json...${NC}"
node scripts/generate-version.js

# Add and commit changes
echo -e "${BLUE}📦 Committing changes...${NC}"
git add package.json package-lock.json version.json
git commit -m "Release v${VERSION_NUMBER}

${RELEASE_NOTES}"

# Create git tag
echo -e "${BLUE}🏷️  Creating git tag...${NC}"
git tag -a "v${VERSION_NUMBER}" -m "Release v${VERSION_NUMBER}

${RELEASE_NOTES}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Release v${VERSION_NUMBER} created successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the changes: ${BLUE}git show${NC}"
echo "  2. Push to remote:     ${BLUE}git push && git push --tags${NC}"
echo "  3. Deploy to CapRover: ${BLUE}git push caprover main${NC}"
echo ""
echo -e "${YELLOW}Or to undo this release:${NC}"
echo "  ${RED}git tag -d v${VERSION_NUMBER}${NC}"
echo "  ${RED}git reset --hard HEAD~1${NC}"
echo ""

