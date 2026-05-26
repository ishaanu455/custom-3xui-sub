(function () {
  "use strict";
  const VERSION = "v3.0-safe";

  const STATE = {
    theme: localStorage.getItem("xui_theme") || "dark",
    lang:  localStorage.getItem("xui_lang")  || "en",
    subUrl: "",
    raw: null,
  };

  const I18N = {
    en: {
      title:"My Subscription", limit:"Data Limit", used:"Used", rem:"Remaining",
      exp:"Expires", nodes:"Configuration Links", copy:"Copy Link", qr:"QR Code",
      online:"Online", offline:"Offline", unlimited:"Unlimited",
      refresh:"Refresh Status", upload:"Upload", download:"Download", copied:"Copied!",
    },
    cn: {
      title:"我的订阅", limit:"流量限制", used:"已用", rem:"剩余",
      exp:"到期时间", nodes:"配置链接", copy:"复制链接", qr:"二维码",
      online:"在线", offline:"离线", unlimited:"不限流量",
      refresh:"刷新状态", upload:"上传", download:"下载", copied:"已复制!",
    },
    fa: {
      title:"اشتراک من", limit:"محدودیت داده", used:"استفاده شده", rem:"باقی‌مانده",
      exp:"انقضا", nodes:"لینک‌های اتصال", copy:"کپی لینک", qr:"کد QR",
      online:"آنلاین", offline:"آفلاین", unlimited:"نامحدود",
      refresh:"بروزرسانی وضعیت", upload:"آپلود", download:"دانلود", copied:"کپی شد!",
    },
  };

  function t(k) { return I18N[STATE.lang][k] || k; }
  const getEl = (id) => document.getElementById(id);
  const mkEl  = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls)  el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  };

  function cleanupName(raw) {
    if (!raw) return "User";
    try {
        let name = decodeURIComponent(raw);
        name = name.replace(/^(⛔️|N\/A|\s|-)+/i, "");
        name = name.replace(/-[\d.]+(?:[GMKTP]B?)?[^\w-]*.*$/i, "");
        name = name.replace(/-\d+[dhm]s?\s*,?\s*\d*[dhm]?/gi, "");
        name = name.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}]/gu, "");
        return name.trim() || "User";
    } catch (e) {
        return raw;
    }
}

function cleanConfigLink(link) {
    if (!link) return link;
    try {
        // Extract the fragment (#) part which contains the name
        let hashIndex = link.indexOf('#');
        if (hashIndex !== -1) {
            let beforeHash = link.substring(0, hashIndex);
            let afterHash = link.substring(hashIndex + 1);
            let cleanedName = cleanupName(decodeURIComponent(afterHash));
            return beforeHash + '#' + encodeURIComponent(cleanedName);
        }
        // For VMESS links, the name is inside JSON (ps field)
        if (link.startsWith('vmess://')) {
            let base64Part = link.substring(8);
            let jsonStr = atob(base64Part);
            let config = JSON.parse(jsonStr);
            if (config.ps) {
                config.ps = cleanupName(config.ps);
                let newJsonStr = JSON.stringify(config);
                return 'vmess://' + btoa(newJsonStr);
            }
        }
        // For Trojan or other protocols, try to find &remark= param
        if (link.includes('?')) {
            let url = new URL(link);
            let remark = url.searchParams.get('remark');
            if (remark) {
                url.searchParams.set('remark', cleanupName(remark));
                return url.toString();
            }
        }
        return link;
    } catch(e) {
        return link;
    }
}


  function formatBytes(b) {
    if (!b || b === 0) return "0 B";
    const k = 1024, s = ["B","KB","MB","GB","TB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + s[i];
  }

  function formatSpeed(kbps) {
    return kbps >= 1024 ? (kbps / 1024).toFixed(1) + " MB/s" : kbps + " KB/s";
  }

  function animateBytes(elId, end, dur = 1200) {
    const el = getEl(elId);
    if (!el || end <= 0) return;
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = formatBytes(Math.floor(e * end));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = formatBytes(end);
    };
    requestAnimationFrame(step);
  }

  function getStatusInfo() {
    const now   = Date.now();
    const total = STATE.raw.total || 0;
    const used  = (STATE.raw.up || 0) + (STATE.raw.down || 0);
    const expired  = STATE.raw.expire > 0 && now > STATE.raw.expire;
    const depleted = total > 0 && used >= total;
    let state = "active", colorVar = "var(--usage-active)", label = "Active";
    if (expired)       { state = "warn";      colorVar = "var(--usage-expired)";  label = "Expired"; }
    else if (depleted) { state = "depleted";  colorVar = "var(--usage-depleted)"; label = "Limited"; }
    else if (total===0){ state = "unlimited"; colorVar = "var(--accent)";          label = "Active"; }
    const pct = total === 0 ? 0 : Math.min(100, (used / total) * 100);
    return { active:!expired&&!depleted, expired, depleted, label, color:colorVar, pct, used, total, state };
  }

  
function formatExpiryCountdown(expireTimestamp) {
    if (!expireTimestamp || expireTimestamp <= Date.now()) return "Expired";
    const diff = expireTimestamp - Date.now();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function startExpiryCountdown() {
    const expiryDiv = document.querySelector('.stat-mini:nth-child(4) .stat-value');
    if (!expiryDiv) return;
    const expireMs = STATE.raw.expire;
    if (!expireMs || expireMs <= 0) return;
    function update() {
        expiryDiv.textContent = formatExpiryCountdown(expireMs);
    }
    update();
    setInterval(update, 1000);
}

function formatRelativeTime(timestampMs) {
    if (!timestampMs || timestampMs <= 0) return "Never";
    const diff = Date.now() - timestampMs;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
    return `${seconds}s ago`;
}

function startLastOnlineUpdater() {
    const lastOnlineDiv = document.querySelector('.stat-mini:nth-child(4) .stat-value');
    if (!lastOnlineDiv) return;
    const lastTs = STATE.raw.lastOnline;
    if (!lastTs || lastTs <= 0) return;
    function update() {
        lastOnlineDiv.textContent = formatRelativeTime(lastTs);
    }
    update();
    setInterval(update, 1000);
}
function getBase() {
    if (window.__X_UI_BASE_PATH__) return window.__X_UI_BASE_PATH__;
    if (window.X_UI_BASE_PATH)     return window.X_UI_BASE_PATH;
    const script = document.querySelector('script[src*="subscription.js"]');
    if (script) {
      const path = new URL(script.src).pathname;
      if (path.includes("assets/js/subscription.js"))
        return path.split("assets/js/subscription.js")[0];
    }
    return "/";
  }

  function init() {
    const currentBase = getBase();
    if (!document.body.classList.contains("premium-theme")) {
      document.body.classList.add("premium-theme");
      document.documentElement.classList.add("premium-theme");
      if (!document.querySelector('link[href*="premium.css"]')) {
        const link = document.createElement("link");
        link.rel  = "stylesheet";
        link.href = currentBase + "assets/css/premium.css?v=" + Date.now();
        document.head.appendChild(link);
      }
    }
    renderLoader();
    if (!STATE.raw) {
      if (window.__SUB_PAGE_DATA__) {
        const d = window.__SUB_PAGE_DATA__;
        STATE.raw = {
          sid:        d.sId || "User",
          total:      parseInt(d.totalByte  || 0),
          up:         parseInt(d.uploadByte || 0),
          down:       parseInt(d.downloadByte || 0),
          expire:     parseInt(d.expire || 0) * 1000,
          subUrl:     d.subUrl || "",
          lastOnline: parseInt(d.lastOnline || 0),
        };
        STATE.subUrl = STATE.raw.subUrl;
        if (d.links && d.links.length > 0) {
          const ta = mkEl("textarea");
          ta.id = "subscription-links";
          ta.style.display = "none";
          ta.value = d.links.join("\n");
          document.body.appendChild(ta);
        }
      } else {
        const dataEl = getEl("subscription-data");
        if (!dataEl) return;
        STATE.raw = {
          sid:        dataEl.getAttribute("data-email") || dataEl.getAttribute("data-sid") || "User",
          total:      parseInt(dataEl.getAttribute("data-totalbyte")    || 0),
          up:         parseInt(dataEl.getAttribute("data-uploadbyte")   || 0),
          down:       parseInt(dataEl.getAttribute("data-downloadbyte") || 0),
          expire:     parseInt(dataEl.getAttribute("data-expire")       || 0) * 1000,
          subUrl:     dataEl.getAttribute("data-sub-url") || "",
          lastOnline: parseInt(dataEl.getAttribute("data-lastonline")   || 0),
        };
        STATE.subUrl = STATE.raw.subUrl;
      }
    }
    renderApp();
    applyTheme();
    if (autoRefreshEnabled) {
        startAutoRefresh();
    
    
    }

    if (!window.networkBg) window.networkBg = new NeuralNetwork();
  }

  
if (!document.querySelector('#notice-force-style')) {
    const style = document.createElement('style');
    style.id = 'notice-force-style';
    style.textContent = '.notice-card { display: flex !important; margin: 10px 0 !important; }';
    document.head.appendChild(style);
}
function renderApp() {
    const old = getEl("app-root");
    if (old) old.remove();
    const app = mkEl("div", "app-container");
    app.id = "app-root";
    app.appendChild(renderHeader());
    app.appendChild(renderPlanBanner());
    const grid = mkEl("div", "dashboard-grid");
    grid.appendChild(renderUsageCard());
    grid.appendChild(renderInfoCard());
    const warnBanner = renderWarningBanner();
    if (warnBanner) grid.appendChild(warnBanner);
    const notice = renderNoticeBoard();
    if (notice) grid.appendChild(notice);
    grid.appendChild(renderAppDownloads());
    grid.appendChild(renderNodesList());
    grid.appendChild(renderPingSection());
    app.appendChild(grid);
    const footer = mkEl("div", "custom-footer");
    footer.innerHTML = `<div class="footer-glitch-wrap">All rights reserved &copy; Aegisx Hosting Team</div>`;
    app.appendChild(footer);
    app.appendChild(renderQRModal());
    app.appendChild(renderToast());
    document.body.appendChild(app);
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.body.classList.add("ready");
        hideLoader();
        const bar = getEl("prog-bar");
        if (bar) {
          const s = getStatusInfo();
          setTimeout(() => { bar.style.transform = `translateX(-${100 - s.pct}%)`; }, 400);
        }
        setTimeout(() => startCounters(), 300);
      }, 600);
    });
  }

  const AEGISX_PLANS = [
    { gb: 100,  price: 250,  label: "100GB Plan",  badge: "Entry",      desc: "Gaming & Browsing",          icon: "⚡", color: "#3b82f6" },
    { gb: 200,  price: 400,  label: "200GB Plan",  badge: "Popular",    desc: "Social Media & HD Streaming", icon: "🎬", color: "#8b5cf6" },
    { gb: 400,  price: 600,  label: "400GB Plan",  badge: "Power",      desc: "Heavy Usage & 4K Content",   icon: "🔥", color: "#f59e0b" },
    { gb: 600,  price: 750,  label: "600GB Plan",  badge: "Best Value", desc: "Ultimate Power User",        icon: "👑", color: "#10b981" },
  ];

  function detectPlan() {
    const totalGB = STATE.raw.total / (1024**3);
    if (!STATE.raw.total || totalGB === 0) return null;
    for (const plan of AEGISX_PLANS) {
      if (Math.abs(totalGB - plan.gb) / plan.gb < 0.15) return plan;
    }
    return AEGISX_PLANS.reduce((prev, curr) =>
      Math.abs(curr.gb - totalGB) < Math.abs(prev.gb - totalGB) ? curr : prev
    );
  }

  function renderPlanBanner() {
    const plan = detectPlan();
    const banner = mkEl("div", "plan-banner");
    if (!plan) {
      banner.innerHTML = `<div class="plan-banner-inner"><div class="plan-icon">♾️</div><div class="plan-info"><div class="plan-name">Unlimited Plan</div><div class="plan-desc">AegisX Premium · Unlimited Data</div></div><div class="plan-price-wrap"><div class="plan-brand">AegisX ⚡</div></div></div>`;
      return banner;
    }
    const s = getStatusInfo();
    const usedGB   = (s.used / (1024**3)).toFixed(1);
    const totalGB  = (STATE.raw.total / (1024**3)).toFixed(0);
    const pctUsed  = s.pct.toFixed(0);
    banner.style.setProperty("--plan-color", plan.color);
    banner.innerHTML = `<div class="plan-banner-inner"><div class="plan-icon-wrap"><div class="plan-icon">${plan.icon}</div><div class="plan-badge">${plan.badge}</div></div><div class="plan-info"><div class="plan-name">${plan.label}</div><div class="plan-desc">${plan.desc}</div><div class="plan-usage-line"><span class="plan-used-text">${usedGB} GB used of ${totalGB} GB</span><span class="plan-pct" style="color:${plan.color}">${pctUsed}%</span></div></div><div class="plan-price-wrap"><div class="plan-price"><span class="plan-currency">LKR</span><span class="plan-amount">${plan.price}</span></div><div class="plan-period">/ month</div><div class="plan-brand">AegisX ⚡</div></div></div>`;
    return banner;
  }

  function renderHeader() {
    const h = mkEl("header", "dashboard-header");
    const linksEl = getEl("subscription-links");
    const links = linksEl ? linksEl.value.split("\n").filter(Boolean) : [];
    let dispName = STATE.raw.sid;
    if (!STATE.raw.sid.includes("@") && links.length > 0 && links[0].includes("#"))
      dispName = links[0].split("#")[1];
    dispName = cleanupName(dispName);
    const s = getStatusInfo();
    const profile = mkEl("div", "user-profile");
    profile.innerHTML = `<div class="avatar">${dispName.substring(0,1).toUpperCase()}</div><div class="user-text-group"><div class="dashboard-title">User Dashboard</div><div class="user-main-row"><div class="username-display" data-text="${dispName}">${dispName}</div><div class="status-indicator-wrap"><span class="status-text-inline" style="color:${s.color}">${s.label}</span><div class="status-dot-inline" style="background:${s.color};box-shadow:0 0 10px ${s.color};border-color:${s.color}44;"></div></div></div></div>`;
    const ctrls = mkEl("div","controls");
    ctrls.style.cssText = "position:relative;z-index:200";
    const themeBtn = mkEl("div","icon-btn");
    themeBtn.id = "theme-btn";
    themeBtn.innerHTML = moonIcon();
    themeBtn.onclick = (e) => {
      themeBtn.style.animation = "bounce 0.6s cubic-bezier(0.68,-0.55,0.265,1.55)";
      setTimeout(() => { themeBtn.style.animation = ""; }, 600);
      toggleTheme(e);
    };
    
    const refreshBtn = mkEl("div", "icon-btn");
    refreshBtn.id = "auto-refresh-btn";
    refreshBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>`;
    refreshBtn.onclick = toggleAutoRefresh;
    if (autoRefreshEnabled) refreshBtn.classList.add("active");
    ctrls.appendChild(refreshBtn);
    ctrls.appendChild(themeBtn);
    h.appendChild(profile);
    h.appendChild(ctrls);
    return h;
  }

  function sunIcon()  { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`; }
  function moonIcon() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`; }

  function renderUsageCard() {
    const card = mkEl("div", "span-8 usage-overview");
    const s = getStatusInfo();
    const limitHtml = s.total === 0 ? `<span class="glitch-text" data-text="${t("unlimited")}">${t("unlimited")}</span>` : formatBytes(s.total);
    card.innerHTML = `<div class="usage-header"><span class="usage-title">Data Usage Metrics</span><span class="usage-title">${s.pct.toFixed(1)}%</span></div><div class="usage-big-number" id="usage-val">0 B</div><div class="progress-container"><div class="progress-bar ${s.total===0?"unlimited-bar":""}" id="prog-bar" style="transform:translateX(${s.total===0?"0":"-100%"});"><div class="bloom"></div></div></div><div class="usage-sub">${t("limit")}: ${limitHtml}</div>`;
    return card;
  }

  
function formatExpiryDate(expireMs) {
    if (!expireMs || expireMs <= 0) return "∞";
    const d = new Date(expireMs);
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString('en-US', options);
}

function formatLastOnline(lastMs) {
    if (!lastMs || lastMs <= 0) return "Never";
    const diff = Date.now() - lastMs;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
    return `${seconds}s ago`;
}
function renderInfoCard() {
    const card = mkEl("div","span-4 stat-mini-grid");
    let remText = "∞";
    if (STATE.raw.total > 0) {
      const left = STATE.raw.total - (STATE.raw.up + STATE.raw.down);
      remText = formatBytes(left < 0 ? 0 : left);
    }
    const rem = mkEl("div","stat-mini");
    rem.innerHTML = `<div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--theme-rem)"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg></div><div class="stat-value" id="rem-val">${STATE.raw.total>0?"0 B":remText}</div><div class="stat-label">${t("rem")}</div>`;
    let expText = "∞";
    if (STATE.raw.expire > 0) {
      expText = formatExpiryDate(STATE.raw.expire);
    }
    const exp = mkEl("div","stat-mini");
    exp.innerHTML = `<div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--theme-exp)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="stat-value">${expText}</div><div class="stat-label">${t("exp")}</div>`;
    const up = mkEl("div","stat-mini");
    up.innerHTML = `<div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--theme-up)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div class="stat-value" id="up-total-val">0 B</div><div class="stat-label">${t("upload")}</div>`;
    const down = mkEl("div","stat-mini");
    down.innerHTML = `<div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--theme-down)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><div class="stat-value" id="down-total-val">0 B</div><div class="stat-label">${t("download")}</div>`;
    let loText = "Never";
    if (STATE.raw.lastOnline > 0) {
      loText = formatLastOnline(STATE.raw.lastOnline);
    }
    const lo = mkEl("div","stat-mini");
    lo.innerHTML = `<div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--status-online)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-value">${loText}</div><div class="stat-label">Last Online</div>`;
    card.appendChild(up); card.appendChild(down); card.appendChild(rem); card.appendChild(lo); card.appendChild(exp);
    return card;
  }

  function renderAppDownloads() {
    const wrap = mkEl("div", "span-12 app-downloads-card");
    wrap.innerHTML = `
      <div class="nodes-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>GET THE APP</span>
      </div>
      <div class="app-grid">
        <a href="https://play.google.com/store/apps/details?id=com.netmod.syna" target="_blank" class="app-btn app-btn-netmod">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
  <line x1="12" y1="18" x2="12.01" y2="18"/>
</svg>
          <div class="app-btn-text"><span class="app-btn-label">⭐ RECOMMENDED</span><span class="app-btn-name">NetMod</span></div>
          <span class="app-btn-platform">Android</span>
        </a>
        <a href="https://sourceforge.net/projects/netmodhttp/files/latest/download" target="_blank" class="app-btn app-btn-netmod-pc">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <div class="app-btn-text"><span class="app-btn-label">⭐ RECOMMENDED</span><span class="app-btn-name">NetMod PC</span></div>
          <span class="app-btn-platform">Windows</span>
        </a>
      </div>`
    return wrap;
  }

  function renderNodesList() {
    const wrap = mkEl("div","span-12");
    wrap.innerHTML = `<div class="nodes-header"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Configuration Links</div>`;
    const grid = mkEl("div","node-grid");
    const links = getEl("subscription-links")?.value.split("\n").filter(Boolean) || [];
    links.forEach((link, i) => grid.appendChild(renderNode(link, i)));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderNode(link, idx) {
    let proto = link.split("://")[0].toUpperCase(), name = "Node "+(idx+1);
    try {
      if (link.includes("#")) name = cleanupName(link.split("#")[1]);
      else if (proto === "VMESS") {
        const b = JSON.parse(atob(link.replace("vmess://","")));
        if (b.ps) name = cleanupName(b.ps);
      }
    } catch(e) {}
    const card = mkEl("div","node-card");
    card.style.animationDelay = 0.3 + idx*0.04 + "s";
    card.innerHTML = `<div class="node-info"><span class="proto-badge">${proto}</span><span class="node-name">${name}</span></div><div class="node-actions" style="display:flex;gap:8px"><div class="icon-btn-mini" id="btn-copy-${idx}" title="Copy Config"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div><div class="icon-btn-mini" id="btn-qr-${idx}" title="Show QR"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></div></div>`;
    card.querySelector(`#btn-copy-${idx}`).onclick = (e) => { e.stopPropagation(); copy(link); };
    card.querySelector(`#btn-qr-${idx}`).onclick   = (e) => { e.stopPropagation(); showQR(link, name); };
    return card;
  }

  function renderNoticeBoard() {
    const NOTICE = "🔄 Server restarts daily at 6:00 AM. Please reconnect after restart.";
    if (!NOTICE) return null;
    const wrap = mkEl("div", "span-12 notice-card");
    wrap.innerHTML = `<div class="notice-icon">📢</div><div class="notice-text">${NOTICE}</div>`;
    return wrap;
  }

  function renderWarningBanner() {
    if (!STATE || !STATE.status) return null;
    const s = STATE.status;
    if (!s || s.state === "unlimited") return null;
    const pct = s.pct;
    if (pct < 80 && s.state === "active") return null;
    let msg = "", icon = "", cls = "";
    if (s.state === "expired") {
      msg = "Your plan has expired. Please renew to continue.";
      icon = "⏰"; cls = "banner-expired";
    } else if (s.state === "depleted") {
      msg = "Your data has been fully used. Please top up.";
      icon = "📵"; cls = "banner-depleted";
    } else if (pct >= 80) {
      msg = `⚠️ ${pct.toFixed(0)}% of your data used. Consider renewing soon.`;
      icon = "⚠️"; cls = "banner-warn";
    }
    if (!msg) return null;
    const wrap = mkEl("div", "span-12 warning-banner " + cls);
    wrap.innerHTML = `<span class="banner-icon">${icon}</span><span class="banner-msg">${msg}</span><a href="https://wa.me/94742410149" target="_blank" class="banner-btn">Renew Now</a>`;
    return wrap;
  }

  function renderPingSection() {
    const wrap = mkEl("div","span-12");
    wrap.innerHTML = `<div class="nodes-header" style="margin-top:20px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> Connection</div>`;
    const grid = mkEl("div","infra-grid infra-grid-1");
    const tgCard = mkEl("div","infra-card tg-card");
    tgCard.innerHTML = `
      <div class="infra-icon tg-icon-wrap">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="color:#25D366">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
        </svg>
      </div>
      <div class="infra-details">
        <div class="infra-value">Support & Renewal</div>
        <div class="infra-label">CHAT WITH US</div>
      </div>
      <div class="support-btns">
        <a href="https://wa.me/94742410149" target="_blank" class="support-btn wa-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
          WhatsApp
        </a>
        <a href="https://t.me/aegisxlte" target="_blank" class="support-btn tg-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.943z"/></svg>
          Telegram
        </a>
      </div>`;
    grid.appendChild(tgCard);
    wrap.appendChild(grid);
    return wrap;
  }

  function checkPing() {
    const valEl = getEl("ping-value"), dot = getEl("ping-dot"), btn = getEl("btn-ping");
    if (!valEl || !btn || btn.classList.contains("loading")) return;
    btn.classList.add("loading");
    dot.className = "ping-dot pinging";
    valEl.textContent = "Testing...";
    const t0 = Date.now();
    fetch(window.location.href, { method:"HEAD", cache:"no-cache" })
      .then(() => {
        const lat = Date.now() - t0;
        valEl.textContent = lat + "ms";
        btn.classList.remove("loading");
        dot.className = "ping-dot " + (lat<150?"success":lat<400?"warn":"error");
        valEl.className = "infra-value " + (lat<150?"text-green":lat<400?"text-yellow":"text-red");
        showToast("Latency: " + lat + "ms");
      })
      .catch(() => {
        valEl.textContent = "Error";
        btn.classList.remove("loading");
        dot.className = "ping-dot error";
        valEl.className = "infra-value text-red";
      });
  }

  function renderQRModal() {
    const overlay = mkEl("div","modal-overlay");
    overlay.id = "qr-modal";
    overlay.style.cssText = "opacity:0;visibility:hidden;pointer-events:none";
    overlay.onclick = (e) => { if (e.target===overlay) overlay.classList.remove("open"); };
    const content = mkEl("div","qr-modal");
    content.innerHTML = `<div class="qr-header"><div class="qr-spacer"></div><h3 id="qr-title">${t("qr")}</h3><div class="qr-close" onclick="document.getElementById('qr-modal').classList.remove('open')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div><div class="qr-container"><canvas id="qr-canv"></canvas><div class="qr-scan-line"></div></div><div class="qr-footer">Scan this QR code to import configuration</div>`;
    overlay.appendChild(content);
    setTimeout(() => {
      const loadQR = () => new QRious({ element:getEl("qr-canv"), value:STATE.subUrl||"https://example.com", size:250 });
      if (window.QRious) { loadQR(); return; }
      const s = document.createElement("script");
      s.src = getBase() + "assets/js/vendor/qrious.min.js";
      s.onload = loadQR;
      s.onerror = () => console.warn("[3X-SUB] qrious.min.js not found");
      document.body.appendChild(s);
    }, 100);
    return overlay;
  }

  function showQR(val, title) {
    const modal = getEl("qr-modal"), canv = getEl("qr-canv"), titleEl = getEl("qr-title");
    if (titleEl) titleEl.textContent = title || t("qr");
    if (window.QRious) {
      requestAnimationFrame(() => {
        new QRious({ element:canv, value:cleanConfigLink(val), size:250 });
        modal.style.opacity = ""; modal.style.visibility = ""; modal.style.pointerEvents = "";
        modal.classList.add("open");
      });
    }
  }

  window.metricsChart = null;
  window.currentMetricType = null;
  window.showMetricsModal = async function(type) {
    window.currentMetricType = type;
    if (!window.ApexCharts) {
      const script = document.createElement("script");
      script.src = getBase() + "assets/js/vendor/apexcharts.min.js";
      script.onload  = () => createMetricsModal(type);
      script.onerror = () => { console.warn("[3X-SUB] apexcharts.min.js not found"); createMetricsModal(type); };
      document.head.appendChild(script);
    } else {
      createMetricsModal(type);
    }
  };

  function createMetricsModal(type) {
    document.body.classList.add("modal-open");
    const bg = getEl("canvas-bg");
    if (bg && bg._network) bg._network.paused = true;
    let overlay = getEl("metrics-overlay");
    if (!overlay) {
      overlay = mkEl("div","metrics-modal-overlay");
      overlay.id = "metrics-overlay";
      overlay.onclick = (e) => { if (e.target===overlay) closeMetricsModal(); };
      document.body.appendChild(overlay);
    }
    const iconColor = type==="cpu"?"var(--theme-cpu)":"var(--theme-ram)";
    const title = type==="cpu"?"CPU Usage History":"Memory Usage History";
    overlay.innerHTML = `<div class="metrics-modal"><div class="metrics-modal-header"><div class="metrics-modal-title"><div style="color:${iconColor}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${type==="cpu"?'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>':"<path d='M4 6h16M4 12h16M4 18h16M8 2v20M12 2v20M16 2v20'/>"}</svg></div><h2>${title}</h2></div><div class="metrics-modal-close" onclick="closeMetricsModal()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div><div class="metrics-tabs"><div class="metrics-tab active" data-period="live">Live</div><div class="metrics-tab" data-period="h1">1 Hour</div><div class="metrics-tab" data-period="h24">24h</div><div class="metrics-tab" data-period="d7">7 Days</div><div class="metrics-tab" data-period="d30">30 Days</div></div><div class="metrics-chart-container"><div id="metrics-loader" class="metrics-loader"><div class="metrics-spinner"></div><span style="margin-top:10px">Loading chart...</span></div><div id="metrics-chart"></div></div></div>`;
    overlay.classList.add("active");
    window.metricsPeriod = "live";
    overlay.querySelectorAll(".metrics-tab").forEach(tab => {
      tab.onclick = () => {
        overlay.querySelectorAll(".metrics-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        window.metricsPeriod = tab.getAttribute("data-period");
        const loader = getEl("metrics-loader");
        if (loader) loader.classList.remove("hidden");
        if (window.lastStatsData) updateChartWithData(window.lastStatsData);
      };
    });
    setTimeout(() => renderMetricsChart(type), 550);
  }

  window.closeMetricsModal = function() {
    document.body.classList.remove("modal-open");
    const bg = getEl("canvas-bg");
    if (bg && bg._network) bg._network.paused = false;
    const overlay = getEl("metrics-overlay");
    if (overlay) overlay.classList.remove("active");
    window.currentMetricType = null;
    window.metricsPeriod = null;
    if (window.metricsChart) {
      const c = window.metricsChart; window.metricsChart = null;
      setTimeout(() => { try { c.destroy(); } catch(e){} }, 500);
    }
  };

  function renderMetricsChart(type) {
    const isDark = STATE.theme==="dark";
    const accent = type==="cpu"?"#6366f1":"#ec4899";
    let initData = [];
    if (window.lastStatsData && window.lastStatsData.history) {
      const h = window.lastStatsData.history[window.metricsPeriod||"live"] || [];
      initData = h.map(p=>({ x:p.t*1000, y:type==="cpu"?p.c:p.r })).reverse();
    }
    const options = {
      series:[{ name:type.toUpperCase(), data:initData }],
      chart:{ type:"area", height:"100%", width:"100%", animations:{enabled:true,easing:"easeinout",speed:800,dynamicAnimation:{enabled:true,speed:350}}, toolbar:{show:false}, zoom:{enabled:false}, background:"transparent", foreColor:"#94a3b8" },
      colors:[accent],
      fill:{ type:"gradient", gradient:{ shade:isDark?"dark":"light", type:"vertical", shadeIntensity:1, opacityFrom:0.65, opacityTo:0.05, stops:[0,100] } },
      dataLabels:{enabled:false},
      stroke:{curve:"smooth",width:3,lineCap:"round"},
      grid:{ borderColor:isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)", strokeDashArray:4, padding:{top:10,right:15,bottom:0,left:15} },
      xaxis:{ type:"datetime", labels:{ datetimeUTC:false, format:"HH:mm", style:{colors:"#94a3b8",fontSize:"11px"} }, axisBorder:{show:false}, axisTicks:{show:false} },
      yaxis:{ min:0, max:100, tickAmount:4, labels:{style:{colors:"#94a3b8",fontSize:"11px"}} },
      tooltip:{ theme:isDark?"dark":"light", x:{format:"HH:mm:ss"}, y:{formatter:(v)=>v.toFixed(0)+"%"} }
    };
    const container = document.querySelector("#metrics-chart");
    if (container && window.ApexCharts) {
      window.metricsChart = new ApexCharts(container, options);
      window.metricsChart.render().then(() => {
        const loader = getEl("metrics-loader");
        if (loader) loader.classList.add("hidden");
      });
    } else {
      const loader = getEl("metrics-loader");
      if (loader) { loader.innerHTML = "<p style='color:var(--text-secondary);text-align:center;padding:20px'>Chart library not loaded.<br>Run installer to self-host vendor scripts.</p>"; }
    }
  }

  function updateChartWithData(data) {
    if (!window.metricsChart || !window.currentMetricType) return;
    const h = data.history?.[window.metricsPeriod||"live"] || [];
    const chartData = h.map(p=>({ x:p.t*1000, y:window.currentMetricType==="cpu"?p.c:p.r })).reverse();
    window.metricsChart.updateSeries([{ name:window.currentMetricType.toUpperCase(), data:chartData }], true);
    const loader = getEl("metrics-loader");
    if (loader && !loader.classList.contains("hidden")) setTimeout(()=>loader.classList.add("hidden"),300);
  }

  function renderLoader() {
    const loader = mkEl("div","preloader");
    loader.id = "app-loader";
    loader.innerHTML = `<div class="loader-content"><div class="loader-spinner"></div><div class="loader-text">USER DASHBOARD</div></div>`;
    document.body.appendChild(loader);
  }
  function hideLoader() {
    const loader = getEl("app-loader");
    if (loader) { loader.style.opacity="0"; setTimeout(()=>{ loader.remove(); document.body.style.overflow=""; }, 800); }
  }
  function renderToast() {
    const el = mkEl("div","premium-toast");
    el.id = "toast";
    el.style.top = "max(24px, env(safe-area-inset-top) + 24px)";
    el.innerText = t("copied");
    return el;
  }
  function showToast(msg) {
    const el = getEl("toast");
    if (!el) return;
    el.innerText = msg;
    el.classList.add("show");
    if (el._t) clearTimeout(el._t);
    el._t = setTimeout(()=>el.classList.remove("show"), 2000);
  }

  function startCounters() {
    const s = getStatusInfo();
    animateBytes("usage-val", s.used);
    if (STATE.raw.total > 0) animateBytes("rem-val", Math.max(0, STATE.raw.total - s.used));
    animateBytes("up-total-val",   STATE.raw.up);
    animateBytes("down-total-val", STATE.raw.down);
  }

  function copy(txt) {
    if (!txt) return;
    const cleaned = cleanConfigLink(txt);
    if (navigator.clipboard && window.isSecureContext)
        navigator.clipboard.writeText(cleaned).then(()=>showToast(t("copied"))).catch(()=>fallbackCopy(cleaned));
    else fallbackCopy(cleaned);
}
  function fallbackCopy(txt) {
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); showToast(t("copied")); } catch(e){}
    document.body.removeChild(ta);
  }

  function applyTheme() {
    const s = getStatusInfo();
    document.body.classList.remove("s-dark","s-light","status-active","status-warn","status-depleted","status-unlimited");
    document.body.classList.add(STATE.theme==="dark"?"s-dark":"s-light");
    document.body.classList.add(`status-${s.state}`);
    const bg = getEl("canvas-bg");
    if (bg && bg._network) bg._network.updateStyles();
  }

  function toggleTheme(e) {
    const nextTheme = STATE.theme==="dark"?"light":"dark";
    const s = getStatusInfo();
    const dummy = document.createElement("div");
    dummy.className = `premium-theme ${nextTheme==="dark"?"s-dark":"s-light"} status-${s.state}`;
    dummy.style.display = "none";
    document.body.appendChild(dummy);
    const burstColor = getComputedStyle(dummy).getPropertyValue("--bg-main").trim() || (nextTheme==="dark"?"#020617":"#f8fafc");
    document.body.removeChild(dummy);
    const btn = e.currentTarget, rect = btn.getBoundingClientRect();
    const burst = mkEl("div","theme-burst");
    burst.style.background = burstColor;
    burst.style.left = rect.left + rect.width/2 + "px";
    burst.style.top  = rect.top  + rect.height/2 + "px";
    document.body.appendChild(burst);
    document.documentElement.classList.add("theme-transitioning");
    setTimeout(()=>{
      STATE.theme = nextTheme;
      localStorage.setItem("xui_theme", STATE.theme);
      applyTheme();
      const btnIcon = getEl("theme-btn");
      if (btnIcon) btnIcon.innerHTML = STATE.theme==="dark" ? moonIcon() : sunIcon();
    }, 250);
    setTimeout(()=>{ document.documentElement.classList.remove("theme-transitioning"); burst.remove(); }, 1600);
  }

  
    // ── Auto‑refresh toggle (30s) ──
    let refreshInterval = null;
    let autoRefreshEnabled = localStorage.getItem("xui_autorefresh") === "true";

    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            console.log("[AUTO-REFRESH] Fetching latest data...");
            refreshUsageData();
        }, 30000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function toggleAutoRefresh() {
        autoRefreshEnabled = !autoRefreshEnabled;
        localStorage.setItem("xui_autorefresh", autoRefreshEnabled);
        const btn = document.getElementById("auto-refresh-btn");
        if (autoRefreshEnabled) {
            btn.classList.add("active");
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>`;
            startAutoRefresh();
    
    
            showToast("Auto-refresh ON (30s)");
        } else {
            btn.classList.remove("active");
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>`;
            stopAutoRefresh();
            showToast("Auto-refresh OFF");
        }
    }

    async function refreshUsageData() {
        try {
            const response = await fetch(window.location.href, { cache: "no-store" });
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            // Extract subscription data from the subscription-data element or inline script
            const dataEl = doc.getElementById("subscription-data");
            if (dataEl) {
                const newRaw = {
                    sid:        dataEl.getAttribute("data-email") || dataEl.getAttribute("data-sid") || "User",
                    total:      parseInt(dataEl.getAttribute("data-totalbyte")    || 0),
                    up:         parseInt(dataEl.getAttribute("data-uploadbyte")   || 0),
                    down:       parseInt(dataEl.getAttribute("data-downloadbyte") || 0),
                    expire:     parseInt(dataEl.getAttribute("data-expire")       || 0) * 1000,
                    subUrl:     dataEl.getAttribute("data-sub-url") || "",
                    lastOnline: parseInt(dataEl.getAttribute("data-lastonline")   || 0),
                };
                // Update global STATE
                STATE.raw = newRaw;
                STATE.subUrl = newRaw.subUrl;
                // Refresh UI elements
                const s = getStatusInfo();
                // Update usage card
                const usageVal = document.getElementById("usage-val");
                if (usageVal) animateBytes("usage-val", s.used);
                const remVal = document.getElementById("rem-val");
                if (remVal && STATE.raw.total > 0) animateBytes("rem-val", Math.max(0, STATE.raw.total - s.used));
                const upVal = document.getElementById("up-total-val");
                if (upVal) animateBytes("up-total-val", STATE.raw.up);
                const downVal = document.getElementById("down-total-val");
                if (downVal) animateBytes("down-total-val", STATE.raw.down);
                // Update expiry text
                const expDiv = document.querySelector('.stat-mini:last-child .stat-value');
                if (expDiv) {
                    let expText = "∞";
                    if (STATE.raw.expire > 0) {
                        expText = formatExpiryDate(STATE.raw.expire);
                    }
                    expDiv.textContent = formatExpiryDate(STATE.raw.expire);
                }
                // Update progress bar
                const progBar = document.getElementById("prog-bar");
                if (progBar) {
                    progBar.style.transform = `translateX(-${100 - s.pct}%)`;
                }
                // Update status indicator
                const statusSpan = document.querySelector('.status-text-inline');
                const statusDot = document.querySelector('.status-dot-inline');
                if (statusSpan) statusSpan.textContent = s.label;
                if (statusSpan) statusSpan.style.color = s.color;
                if (statusDot) statusDot.style.background = s.color;
                if (statusDot) statusDot.style.boxShadow = `0 0 10px ${s.color}`;
                
                const loDiv = document.querySelector('.stat-mini:nth-child(4) .stat-value');
                if (loDiv) loDiv.textContent = formatLastOnline(STATE.raw.lastOnline);
showToast("Data refreshed");
            } else {
                console.warn("Could not extract fresh data – reloading page");
                location.reload();
            }
        } catch (err) {
            console.error("Auto-refresh failed:", err);
            showToast("Refresh failed – check connection");
        }
    }
class NeuralNetwork {
    constructor() {
      if (document.getElementById("canvas-bg")) {
        this.canvas = document.getElementById("canvas-bg");
        this.ctx = this.canvas.getContext("2d");
      } else {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "canvas-bg";
        document.body.prepend(this.canvas);
        this.ctx = this.canvas.getContext("2d");
      }
      this.canvas._network = this;
      this.particles = []; this.packets = [];
      this.mouse = { x:null, y:null, radius:220 };
      this.isScrolling = false;
      this.styles = { pColor:"99, 102, 241", lColor:"148, 163, 184" };
      this.updateStyles();
      if (!this.observer) {
        this.observer = new MutationObserver(()=>this.updateStyles());
        this.observer.observe(document.body, { attributes:true, attributeFilter:["class"] });
      }
      let retries=0;
      const retry = setInterval(()=>{ this.updateStyles(); if(++retries>10) clearInterval(retry); }, 100);
      this.resize();
      if (!this.handlersBound) {
        window.addEventListener("resize", ()=>{ clearTimeout(this.resizeTimeout); this.resizeTimeout=setTimeout(()=>this.resize(),200); });
        window.addEventListener("mousemove",(e)=>{ if(!this.isScrolling){ this.mouse.x=e.x; this.mouse.y=e.y; } });
        window.addEventListener("mouseout",()=>{ this.mouse.x=null; this.mouse.y=null; });
        window.addEventListener("scroll",()=>{
          if(!this.isScrolling){ this.isScrolling=true; document.body.classList.add("is-scrolling"); }
          this.mouse.x=null; this.mouse.y=null;
          clearTimeout(this.scrollTimeout);
          this.scrollTimeout=setTimeout(()=>{ this.isScrolling=false; document.body.classList.remove("is-scrolling"); },200);
        },{passive:true});
        this.handlersBound=true;
      }
      this.initParticles();
      this.animate = this.animate.bind(this);
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.animFrame = requestAnimationFrame(this.animate);
      this.glitchTimer=0; this.glitchInterval=3+Math.random()*5;
      this.glitchActive=false; this.glitchDuration=0; this.glitchElapsed=0;
      this.glitchSlices=[]; this.paused=false;
    }
    updateStyles() {
      const s = getComputedStyle(document.body);
      this.styles.pColor = s.getPropertyValue("--node-color").trim() || "99, 102, 241";
      this.styles.lColor = s.getPropertyValue("--line-color").trim() || "148, 163, 184";
    }
    resize() {
      const dpr = window.devicePixelRatio||1;
      this.canvas.width  = window.innerWidth  * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width  = window.innerWidth  + "px";
      this.canvas.style.height = window.innerHeight + "px";
      this.ctx.scale(dpr, dpr);
      if (this.particles.length===0) this.initParticles();
    }
    initParticles() {
      this.particles=[];
      let n = (window.innerWidth*window.innerHeight)/11000;
      for (let i=0;i<n;i++) {
        let size=Math.random()*2.0+1.0, x=Math.random()*window.innerWidth, y=Math.random()*window.innerHeight;
        let moveAngle=Math.random()*Math.PI*2, baseSpeed=0.2+Math.random()*0.15;
        this.particles.push({ x,y,vx:Math.cos(moveAngle)*baseSpeed,vy:Math.sin(moveAngle)*baseSpeed,baseSpeed,size,baseSize:size,angle:Math.random()*6.28,pulseSpeed:0.01+Math.random()*0.02 });
      }
    }
    animate() {
      this.animFrame = requestAnimationFrame(this.animate);
      if (this.isScrolling||this.paused) return;
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      const cD=160, cDSq=cD*cD, {pColor,lColor}=this.styles;
      for (let i=this.packets.length-1;i>=0;i--) {
        let pkt=this.packets[i]; pkt.progress+=pkt.speed;
        if(pkt.progress>=1){this.packets.splice(i,1);continue;}
        let cx=pkt.p1.x+(pkt.p2.x-pkt.p1.x)*pkt.progress, cy=pkt.p1.y+(pkt.p2.y-pkt.p1.y)*pkt.progress;
        this.ctx.beginPath(); this.ctx.arc(cx,cy,2,0,Math.PI*2);
        this.ctx.fillStyle=`rgba(${pColor},1)`; this.ctx.shadowBlur=8; this.ctx.shadowColor=`rgba(${pColor},0.8)`; this.ctx.fill(); this.ctx.shadowBlur=0;
      }
      for (let i=0;i<this.particles.length;i++) {
        let p=this.particles[i]; p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>window.innerWidth) p.vx*=-1;
        if(p.y<0||p.y>window.innerHeight) p.vy*=-1;
        if(p.angle!==undefined){p.angle+=p.pulseSpeed||0.02;p.size=(p.baseSize||p.size)+Math.sin(p.angle)*0.6;}
        if(this.mouse.x!=null){let dx=p.x-this.mouse.x,dy=p.y-this.mouse.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<this.mouse.radius){let f=(this.mouse.radius-dist)/this.mouse.radius,a=Math.atan2(dy,dx);p.x+=Math.cos(a)*f*3;p.y+=Math.sin(a)*f*3;}}
        for(let j=i+1;j<this.particles.length;j++){let p2=this.particles[j],dx=p.x-p2.x,dy=p.y-p2.y,d=Math.sqrt(dx*dx+dy*dy),ps=85;if(d<ps&&d>0){let f=(ps-d)/ps*0.005;p.vx+=(dx/d)*f;p.vy+=(dy/d)*f;p2.vx-=(dx/d)*f;p2.vy-=(dy/d)*f;}}
        let sp=Math.sqrt(p.vx*p.vx+p.vy*p.vy);if(sp>0){let ma=Math.atan2(p.vy,p.vx)+(Math.random()-0.5)*0.035,ts=p.baseSpeed||0.25,ns=sp+(ts-sp)*0.015;p.vx=Math.cos(ma)*ns;p.vy=Math.sin(ma)*ns;}
        this.ctx.beginPath();this.ctx.arc(p.x,p.y,Math.max(0,p.size),0,Math.PI*2,false);this.ctx.fillStyle=`rgba(${pColor},0.85)`;this.ctx.fill();
        for(let j=i+1;j<this.particles.length;j++){let p2=this.particles[j],dx=p.x-p2.x,dy=p.y-p2.y,dSq=dx*dx+dy*dy;if(dSq<cDSq){let d=Math.sqrt(dSq),op=1-d/cD;this.ctx.beginPath();this.ctx.strokeStyle=`rgba(${lColor},${op*0.6})`;this.ctx.lineWidth=1.2;this.ctx.moveTo(p.x,p.y);this.ctx.lineTo(p2.x,p2.y);this.ctx.stroke();if(op>0.1&&Math.random()<0.0015)this.packets.push({p1:p,p2:p2,progress:0,speed:0.02+Math.random()*0.03});}}
      }
      this._updateGlitch();
    }
    _updateGlitch() {
      const dt=1/60,ctx=this.ctx,w=window.innerWidth,h=window.innerHeight;
      if(!this.glitchActive){
        this.glitchTimer+=dt;
        if(this.glitchTimer>=this.glitchInterval){
          this.glitchActive=true;this.glitchTimer=0;this.glitchInterval=12+Math.random()*6;
          this.glitchDuration=0.2+Math.random()*0.4;this.glitchElapsed=0;
          const n=6+Math.floor(Math.random()*8);this.glitchSlices=[];
          for(let i=0;i<n;i++)this.glitchSlices.push({y:Math.random()*h,height:5+Math.random()*50,offset:(Math.random()-0.5)*120});
        }
        return;
      }
      this.glitchElapsed+=dt;
      if(this.glitchElapsed>=this.glitchDuration){
        this.glitchActive=false;
        for(const p of this.particles){if(p._jitterX){p.x-=p._jitterX;p._jitterX=0;}if(p._jitterY){p.y-=p._jitterY;p._jitterY=0;}}
        return;
      }
      const prog=this.glitchElapsed/this.glitchDuration,intens=Math.sin(prog*Math.PI);
      const {pColor,lColor}=this.styles;
      const isDark=document.body.classList.contains("s-dark");
      const bgMain=isDark?"#020617":"#f8fafc";
      for(const p of this.particles){if(p._jitterX)p.x-=p._jitterX;if(p._jitterY)p.y-=p._jitterY;p._jitterX=(Math.random()-0.5)*25*intens;p._jitterY=(Math.random()-0.5)*12*intens;p.x+=p._jitterX;p.y+=p._jitterY;}
      for(const sl of this.glitchSlices){const sH=sl.height*intens,off=sl.offset*intens;if(Math.abs(off)<1||sH<1)continue;const sy=Math.max(0,Math.floor(sl.y)),sh=Math.max(1,Math.min(Math.ceil(sH),h-sy));ctx.drawImage(this.canvas,0,sy,w,sh,off,sy,w,sh);ctx.fillStyle=bgMain;if(off>0)ctx.fillRect(0,sy,off,sh);else ctx.fillRect(w+off,sy,-off,sh);}
      const nA=Math.floor(4+intens*8);
      for(let i=0;i<nA;i++){const ly=Math.random()*h,lh=2+Math.random()*8*intens,sh=(Math.random()-0.5)*40*intens;ctx.save();ctx.globalAlpha=(isDark?0.5:0.35)*intens;ctx.globalCompositeOperation=isDark?"screen":"multiply";ctx.fillStyle=`rgba(${pColor},${0.7*intens})`;ctx.fillRect(sh,ly,w,lh);ctx.fillStyle=`rgba(${lColor},${0.6*intens})`;ctx.fillRect(-sh,ly+3,w,lh*0.8);ctx.restore();}
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
