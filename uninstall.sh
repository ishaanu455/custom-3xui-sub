#!/bin/bash
# Uninstall AegisX custom 3x-ui and restore original MHSanaei 3x-ui

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}⚠️  AegisX Custom 3x-ui Uninstaller${NC}"
echo "This will remove the custom binary and restore the official MHSanaei 3x-ui."
echo "Your existing settings (users, inbounds, database) will be preserved."
echo ""

read -p "Are you sure? Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
fi

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Must be root (sudo)${NC}"
   exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    ORIG_BINARY_URL="https://github.com/MHSanaei/3x-ui/releases/latest/download/x-ui-linux-amd64"
elif [[ "$ARCH" == "aarch64" ]]; then
    ORIG_BINARY_URL="https://github.com/MHSanaei/3x-ui/releases/latest/download/x-ui-linux-arm64"
else
    echo -e "${RED}Unsupported arch: $ARCH${NC}"
    exit 1
fi

BACKUP_DIR="/opt/x-ui-pre-uninstall-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [[ -d /usr/local/x-ui ]]; then
    cp -r /usr/local/x-ui "$BACKUP_DIR/"
    echo "✅ Backed up current custom install to $BACKUP_DIR"
fi

echo "🛑 Stopping x-ui..."
systemctl stop x-ui || true

echo "📥 Downloading original MHSanaei 3x-ui binary..."
curl -L -o /tmp/x-ui-original "$ORIG_BINARY_URL"

echo "📦 Replacing binary..."
cp /tmp/x-ui-original /usr/local/x-ui/x-ui
chmod +x /usr/local/x-ui/x-ui

echo "🧹 Removing custom web assets..."
rm -rf /usr/local/x-ui/web/assets/css/premium.css
rm -rf /usr/local/x-ui/web/assets/js/subscription.js

echo "🚀 Starting x-ui with original binary..."
systemctl start x-ui

rm -f /tmp/x-ui-original

echo -e "${GREEN}✅ Uninstall complete! Original MHSanaei 3x-ui is now running.${NC}"
echo -e "Your data (users, inbounds, certs) are preserved."
echo "🌐 Access panel at the same port (usually 32733 or 54321)"
echo "ℹ️  Login credentials unchanged."
