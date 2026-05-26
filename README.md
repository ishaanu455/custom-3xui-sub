# 🚀 AegisX Custom 3x‑UI Subscription Panel

[![GitHub release](https://img.shields.io/github/v/release/ishaanu455/custom-3xui-sub)](https://github.com/ishaanu455/custom-3xui-sub/releases)
[![GitHub stars](https://img.shields.io/github/stars/ishaanu455/custom-3xui-sub)](https://github.com/ishaanu455/custom-3xui-sub/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Professional subscription dashboard for 3x‑ui** – auto‑refresh, smart node name cleaning, WhatsApp/Telegram support, and a beautiful modern UI.

---

## ✨ Features

- ✅ **One‑click install / uninstall** – no manual configuration needed
- ✅ **Auto‑refresh toggle** (30s) – always up‑to‑date usage stats
- ✅ **Smart node name cleaning** – removes traffic, expiry, emojis from config names
- ✅ **WhatsApp & Telegram support buttons** – gradient, hover effects
- ✅ **Professional UI** – dark/light mode, glassmorphism, responsive
- ✅ **QR code with clean config links** – import directly to any VPN app
- ✅ **Full backup before upgrade** – your data is always safe
- ✅ **Easy revert to original 3x‑ui** – uninstall script restores MHSanaei version

---

## 📦 One‑Line Install (on your VPS)

Run as **root**:

```bash
sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/ishaanu455/custom-3xui-sub/main/install.sh)"
```

The script will:
- Back up your current installation (configs, database, certificates)
- Download the latest custom build
- Replace the binary and restart the service
- Preserve all your existing settings (users, inbounds, data)

---

## 🔄 Uninstall / Revert to Original 3x‑ui

If you ever want to go back to the **official MHSanaei 3x‑ui**:

```bash
sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/ishaanu455/custom-3xui-sub/main/uninstall.sh)"
```

> Your data (users, inbounds, traffic) will **NOT** be lost – only the binary and custom web assets are replaced.

---

## 🖼️ Preview

| Light Mode | Dark Mode |
|------------|-----------|
| *(screenshot placeholder)* | *(screenshot placeholder)* |

---

## 🛠️ Build from source (for developers)

If you want to modify the subscription page yourself:

1. Fork this repository
2. Edit `web/assets/js/subscription.js` or `web/assets/css/premium.css`
3. Push to your fork – GitHub Actions will automatically build a new binary
4. Download the release and replace `/usr/local/x-ui/x-ui`

---

## 📝 Notes

- The panel runs on port **32733** (HTTPS) by default – access with `https://your-server-ip:32733`
- Default credentials: `admin` / `admin` – **change them immediately**
- Your subscription URL remains the same: `https://your-server-ip:2096/sub/...`

---

## 🤝 Credits

- Original [3x‑ui](https://github.com/MHSanaei/3x-ui) by MHSanaei
- Custom UI & enhancements by AegisX Hosting Team

---

## 📄 License

MIT – do whatever you want, but keep the credits.
