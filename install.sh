#!/bin/bash
# One-click installer for AegisX custom 3x-ui panel
# With version check, full backup, safe upgrade

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}▶ AegisX Custom 3x-ui Installer${NC}"

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root (sudo)${NC}"
   exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    BINARY_NAME="x-ui-linux-amd64"
elif [[ "$ARCH" == "aarch64" ]]; then
    BINARY_NAME="x-ui-linux-arm64"
else
    echo -e "${RED}❌ Unsupported architecture: $ARCH${NC}"
    exit 1
fi

BACKUP_DIR="/opt/x-ui-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}📁 Creating full backup in $BACKUP_DIR${NC}"

if [[ -d /usr/local/x-ui ]]; then
    cp -r /usr/local/x-ui "$BACKUP_DIR/x-ui-folder"
    echo "✅ Backed up /usr/local/x-ui"
fi
if [[ -f /etc/x-ui/config.json ]]; then
    cp /etc/x-ui/config.json "$BACKUP_DIR/"
    echo "✅ Backed up /etc/x-ui/config.json"
fi
if [[ -f /etc/x-ui/x-ui.db ]]; then
    cp /etc/x-ui/x-ui.db "$BACKUP_DIR/"
    echo "✅ Backed up database"
fi
if [[ -d /etc/x-ui/certs ]]; then
    cp -r /etc/x-ui/certs "$BACKUP_DIR/"
    echo "✅ Backed up certificates"
fi
if [[ -f /usr/local/x-ui/x-ui ]]; then
    cp /usr/local/x-ui/x-ui "$BACKUP_DIR/x-ui.bin.old"
fi

echo -e "${GREEN}✅ Full backup completed at $BACKUP_DIR${NC}"

CURRENT_VERSION=""
if [[ -f /usr/local/x-ui/x-ui ]]; then
    CURRENT_VERSION=$(/usr/local/x-ui/x-ui -v 2>/dev/null | grep -oP 'version \K[0-9.]+' || echo "unknown")
fi

echo "🔍 Checking latest release..."
LATEST_JSON=$(curl -s https://api.github.com/repos/ishaanu455/custom-3xui-sub/releases/latest)
LATEST_VERSION=$(echo "$LATEST_JSON" | grep -oP '"tag_name": "\K[^"]+' | sed 's/v//')
DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep -o "https://.*$BINARY_NAME" | head -1)

if [[ -z "$DOWNLOAD_URL" ]]; then
    echo -e "${RED}❌ Could not find download URL for $BINARY_NAME${NC}"
    exit 1
fi

echo -e "Current version: ${YELLOW}$CURRENT_VERSION${NC}"
echo -e "Latest version:  ${GREEN}$LATEST_VERSION${NC}"

if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
    echo -e "${GREEN}✅ Already on latest version. No update needed.${NC}"
    echo "To force reinstall, run: rm -f /tmp/x-ui-new && bash install.sh"
    exit 0
fi

echo "📥 Downloading $BINARY_NAME..."
curl -L -o /tmp/x-ui-new "$DOWNLOAD_URL"

echo "🛑 Stopping x-ui..."
systemctl stop x-ui || true

if [[ -f /usr/local/x-ui/x-ui ]]; then
    mv /usr/local/x-ui/x-ui "$BACKUP_DIR/x-ui.old"
fi

echo "📦 Installing new version..."
mkdir -p /usr/local/x-ui
cp /tmp/x-ui-new /usr/local/x-ui/x-ui
chmod +x /usr/local/x-ui/x-ui

echo "🚀 Starting x-ui..."
systemctl start x-ui

rm -f /tmp/x-ui-new

echo -e "${GREEN}✅ Installation complete!${NC}"
echo -e "🔐 Backup stored at: ${YELLOW}$BACKUP_DIR${NC}"

