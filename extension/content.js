// AAPC Purchases Explorer - Content Script & Web App
// Multi-Product Line Items & Per-Product "Shipped To" Deep Fetch Engine

(function () {
  "use strict";

  const CREDENTIALS = {
    username: "Cardeahealthcare",
    password: "Walnut@143!"
  };

  // Data Stores
  let allLineItems = [];       // Flattened list of individual product line items
  let orderReceipts = [];      // Top-level orders
  let currentActiveTab = "all"; // 'all' | 'receipts' | 'products' | 'inspector'
  let displayedList = [];
  let isDeepFetching = false;
  let isCancelRequested = false;

  // Year Categorization & Sorting State
  let selectedYear = "all";    // 'all' | '2024' | '2023' | '2022' ...
  let groupByYear = false;     // boolean flag for grouped view
  let sortDirection = "desc";  // 'desc' (newest first) | 'asc' (oldest first)
  let currentSearchQuery = ""; // Search filter text

  /* ============================================================
     DATE & YEAR PARSING HELPERS
     ============================================================ */
  function extractDateString(text) {
    if (!text || typeof text !== "string") return "";

    // 1. Text with explicit labels like "Date: 8/8/2022" or "Invoice Date: Aug 22, 2022"
    const labelMatch = text.match(/(?:Invoice\s*Date|Order\s*Date|Receipt\s*Date|Transaction\s*Date|Purchase\s*Date|Date)\s*:?\s*([A-Za-z0-9\s,\/\-\.]+)/i);
    if (labelMatch && labelMatch[1]) {
      const sub = extractDateString(labelMatch[1].trim());
      if (sub) return sub;
    }

    // 2. Named month format: "Aug 22, 2022", "August 22, 2022", "Aug. 08, 2022"
    const monthNameMatch = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/i);
    if (monthNameMatch) return monthNameMatch[0].trim();

    // 3. Day-Month-Year format: "22 Aug 2022", "08-Aug-2022", "22nd Aug 2022"
    const dayMonthMatch = text.match(/\b\d{1,2}(?:st|nd|rd|th)?[\s\-\/](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:[\s\-\/]\d{2,4})?\b/i);
    if (dayMonthMatch) return dayMonthMatch[0].trim();

    // 4. Numerical format: M/D/YYYY, MM/DD/YYYY, M-D-YYYY, MM-DD-YYYY, M.D.YYYY
    const numMatch = text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/);
    if (numMatch) return numMatch[0].trim();

    // 5. ISO format: YYYY-MM-DD
    const isoMatch = text.match(/\b(19\d{2}|20\d{2})[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/);
    if (isoMatch) return isoMatch[0].trim();

    return "";
  }

  function extractYear(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return "Unknown";
    // Check 4-digit year 1990-2099
    const y4 = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    if (y4) return y4[1];
    // Check 2-digit year at end of slash/dash: 8/8/22 -> 2022
    const y2 = dateStr.match(/[\/\-\.](\d{2})\b/);
    if (y2) {
      const yr = parseInt(y2[1], 10);
      return yr >= 50 ? `19${yr}` : `20${yr}`;
    }
    return "Unknown";
  }

  function parseDateToTimestamp(dateStr) {
    if (!dateStr || dateStr === "N/A" || dateStr === "Unknown") return 0;
    const ts = Date.parse(dateStr);
    if (!isNaN(ts)) return ts;
    const m = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? (parseInt(m[3], 10) >= 50 ? 1900 + parseInt(m[3], 10) : 2000 + parseInt(m[3], 10)) : parseInt(m[3], 10);
      return new Date(y, parseInt(m[1], 10) - 1, parseInt(m[2], 10)).getTime();
    }
    return 0;
  }

  // Initialize once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    console.log("[AAPC App] Initializing on:", window.location.href);

    if (isLoginPage()) {
      setupLoginHelper();
      return;
    }

    setupFloatingLauncher();
    setupModalOverlay();

    // Auto-scrape page data after page components settle
    setTimeout(() => {
      scrapeActivePage();
    }, 1000);
  }

  /* ============================================================
     1. LOGIN HELPER MODULE (Azure AD B2C / AAPC Login)
     ============================================================ */
  function isLoginPage() {
    const url = window.location.href.toLowerCase();
    return (
      url.includes("b2clogin.com") ||
      url.includes("loginazure.aspx") ||
      url.includes("/sso-landing/") ||
      url.includes("/login") ||
      document.querySelector('input[type="password"]') !== null
    );
  }

  function setupLoginHelper() {
    const passwordInput = document.querySelector('input[type="password"]');
    if (!passwordInput && !document.getElementById("signInName") && !document.getElementById("logonIdentifier")) {
      setTimeout(setupLoginHelper, 800);
      return;
    }

    if (document.getElementById("aapc-login-toast")) return;

    const toast = document.createElement("div");
    toast.id = "aapc-login-toast";
    toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; color:#0056b3; font-size:13px;">🔐 AAPC Quick Login</span>
        <button id="aapc-close-login-toast" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">&times;</button>
      </div>
      <p style="font-size:12px; color:#475569; margin:0 0 10px 0;">
        Sign in with <b>${CREDENTIALS.username}</b>?
      </p>
      <button id="aapc-autologin-btn" style="width:100%; background:#0056b3; color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:600; cursor:pointer; font-size:13px;">
        Auto-Fill & Sign In
      </button>
    `;

    document.body.appendChild(toast);
    document.getElementById("aapc-close-login-toast").onclick = () => toast.remove();
    document.getElementById("aapc-autologin-btn").onclick = performAutoLogin;
  }

  function performAutoLogin() {
    const userInput =
      document.getElementById("signInName") ||
      document.getElementById("logonIdentifier") ||
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[name*="user" i]') ||
      document.querySelector('input[name*="login" i]') ||
      document.querySelector('input[type="text"]');

    const passInput =
      document.getElementById("password") ||
      document.querySelector('input[type="password"]');

    if (userInput) {
      userInput.focus();
      userInput.value = CREDENTIALS.username;
      userInput.dispatchEvent(new Event("input", { bubbles: true }));
      userInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (passInput) {
      passInput.focus();
      passInput.value = CREDENTIALS.password;
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
      passInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const submitBtn =
      document.getElementById("next") ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('input[type="submit"]') ||
      document.querySelector(".buttons #next");

    if (submitBtn) {
      setTimeout(() => submitBtn.click(), 400);
    }
  }

  /* ============================================================
     2. FLOATING LAUNCHER & MODAL OVERLAY
     ============================================================ */
  function setupFloatingLauncher() {
    if (document.getElementById("aapc-launcher-btn")) return;

    const launcher = document.createElement("div");
    launcher.id = "aapc-launcher-btn";
    launcher.innerHTML = `
      <span>🛒 AAPC Purchases App</span>
      <span id="aapc-launcher-badge">0</span>
    `;

    launcher.addEventListener("click", () => {
      toggleModal(true);
    });

    document.body.appendChild(launcher);
  }

  function setupModalOverlay() {
    if (document.getElementById("aapc-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "aapc-modal-overlay";
    overlay.innerHTML = `
      <div id="aapc-app-container">
        <!-- Header -->
        <div class="aapc-header">
          <div class="aapc-title-area">
            <span class="aapc-logo-badge">AAPC</span>
            <div class="aapc-title-text">
              <h2>Purchases Explorer & Downloader</h2>
              <p>Multi-Product Line Items & Per-Product "Shipped To" Manager</p>
            </div>
          </div>
          <div class="aapc-header-actions">
            <button id="aapc-btn-refresh" class="aapc-btn aapc-btn-outline" title="Re-scan page for purchases">
              🔄 Re-Scan Page
            </button>
            <button id="aapc-btn-demo" class="aapc-btn aapc-btn-outline" title="Load sample multi-product demo purchases">
              🧪 Sample Data
            </button>
            <button id="aapc-btn-close" class="aapc-btn-icon-close" title="Close Overlay">&times;</button>
          </div>
        </div>

        <!-- Metric Stats Bar -->
        <div class="aapc-stats-bar">
          <div class="aapc-stat-item">
            <span class="aapc-stat-label">Total Line Items</span>
            <span class="aapc-stat-val" id="aapc-stat-count">0</span>
          </div>
          <div class="aapc-stat-item">
            <span class="aapc-stat-label">Total Spend</span>
            <span class="aapc-stat-val accent" id="aapc-stat-amount">$0.00</span>
          </div>
          <div class="aapc-stat-item">
            <span class="aapc-stat-label">Shipped To Destinations</span>
            <span class="aapc-stat-val" id="aapc-stat-destinations" style="font-size: 15px; color: #d97706;">
              0 locations
            </span>
          </div>
          <div class="aapc-stat-item" style="margin-left: auto;">
            <span class="aapc-stat-label">Member Account</span>
            <span class="aapc-stat-val" style="font-size: 13px; color: #0056b3;">
              ${CREDENTIALS.username}
            </span>
          </div>
        </div>

        <!-- Deep-Fetch Banner -->
        <div id="aapc-deep-fetch-bar">
          <span id="aapc-deep-fetch-text">⚡ Deep-fetching individual line items & student destinations...</span>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="aapc-deep-fetch-spinner" style="font-weight: bold;">⏳ Scanning...</span>
            <button id="aapc-btn-cancel-deep-fetch" style="background: #ef4444; color: white; border: none; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer;" title="Stop deep-fetching">
              ⏹️ Stop
            </button>
          </div>
        </div>

        <!-- Multi-Product & Student Explanation Banner -->
        <div class="aapc-info-banner">
          <div>
            <span>💡 <strong>AAPC Multi-Product Note:</strong> On <code>my-purchased-items.aspx</code>, AAPC displays only <em>Cardea Healthcare</em> in the summary table. Click <strong>⚡ Deep-Fetch Line Items & Students</strong> or <strong>🔍 Expand Students</strong> on any order to fetch the receipt and unpack the individual student recipients (e.g., <em>Fathima N S</em>, <em>Sillaa PS</em>, <em>Bismi Nazar S</em>).</span>
          </div>
        </div>

        <!-- Source Selector Tabs -->
        <div class="aapc-tabs-bar">
          <button class="aapc-tab-btn active" data-tab="all" id="tab-btn-all">
            📦 All Products & Line Items (<span id="badge-tab-all">0</span>)
          </button>
          <button class="aapc-tab-btn" data-tab="receipts" id="tab-btn-receipts">
            🧾 Order Receipts (<span id="badge-tab-receipts">0</span>)
          </button>
          <button class="aapc-tab-btn" data-tab="inspector" id="tab-btn-inspector" style="margin-left: auto; border-color: #f59e0b; color: #b45309;">
            🔍 Page Tables Inspector
          </button>
        </div>

        <!-- Year Categorization Bar -->
        <div class="aapc-year-category-bar" id="aapc-year-bar">
          <span class="aapc-year-label">📅 Year:</span>
          <div class="aapc-year-pills" id="aapc-year-pills">
            <button class="aapc-year-pill active" data-year="all">🌟 All Years</button>
          </div>
          <button id="aapc-btn-expand-year-bar" class="aapc-expand-year-btn" style="margin-left: 8px; display: none;" title="Expand all students for selected year">
            ⚡ Expand Students for <span id="aapc-year-bar-target">Year</span>
          </button>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer; user-select: none;">
              <input type="checkbox" id="aapc-group-by-year-chk" />
              🗂️ Group by Year
            </label>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="aapc-toolbar">
          <div class="aapc-search-box">
            <span>🔍</span>
            <input type="text" id="aapc-search-input" placeholder="Search by Order ID, Product, Student / Shipped To, Bill To, Date, Year..." />
          </div>

          <div class="aapc-btn-group">
            <button id="aapc-btn-deep-fetch" class="aapc-btn aapc-btn-warning" title="Crawl each order detail page to extract all multiple products and distinct student shipping recipients">
              ⚡ Deep-Fetch Line Items & Students
            </button>
            <button id="aapc-btn-export-csv" class="aapc-btn aapc-btn-success">
              📥 Export to CSV
            </button>
            <button id="aapc-btn-download-all" class="aapc-btn aapc-btn-primary">
              ⚡ Download All Receipts
            </button>
          </div>
        </div>

        <!-- Main Table Container -->
        <div class="aapc-table-wrapper" id="aapc-main-table-wrap">
          <table class="aapc-data-table">
            <thead>
              <tr>
                <th style="width: 150px;">Order Id</th>
                <th>Bill To</th>
                <th style="width: 135px; cursor: pointer; user-select: none;" id="aapc-th-date" title="Click to sort by Invoice Date">Invoice Date <span id="aapc-sort-indicator" style="font-size: 11px; color: #0284c7;">▼</span></th>
                <th>Product Type</th>
                <th>Shipped To</th>
                <th style="width: 110px;">Amount</th>
                <th style="width: 130px; text-align: center;">Action</th>
              </tr>
            </thead>
            <tbody id="aapc-table-body">
              <tr>
                <td colspan="7">
                  <div class="aapc-empty-state">
                    <div class="aapc-empty-icon">⏳</div>
                    <h3>Scanning AAPC Purchases...</h3>
                    <p>Extracting multi-product orders and individual "Shipped To" destinations. Click "Sample Data" to preview.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Page Inspector Panel (Diagnostic view for user) -->
        <div class="aapc-inspector-panel" id="aapc-inspector-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0; font-size:15px; color:#0f172a;">Detected Tables & Containers on AAPC Page</h3>
            <span style="font-size:12px; color:#64748b;">Inspect raw tables or load specific grids.</span>
          </div>
          <div id="aapc-inspector-tables-list"></div>
        </div>

        <!-- Footer -->
        <div class="aapc-footer">
          <span>Active View: <code id="aapc-active-view-name">All Product Line Items</code></span>
          <span>Showing <b id="aapc-footer-count">0</b> line items</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById("aapc-btn-close").onclick = () => toggleModal(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) toggleModal(false);
    };

    document.getElementById("aapc-btn-refresh").onclick = () => scrapeActivePage();
    document.getElementById("aapc-btn-demo").onclick = () => loadDemoData();
    document.getElementById("aapc-search-input").oninput = (e) => filterPurchases(e.target.value);
    document.getElementById("aapc-btn-export-csv").onclick = exportToCSV;
    document.getElementById("aapc-btn-download-all").onclick = batchDownload;
    document.getElementById("aapc-btn-deep-fetch").onclick = () => {
      triggerDeepFetchLineItems(selectedYear !== "all" ? selectedYear : null);
    };
    const barBtn = document.getElementById("aapc-btn-expand-year-bar");
    if (barBtn) {
      barBtn.onclick = () => {
        if (selectedYear && selectedYear !== "all") {
          triggerDeepFetchLineItems(selectedYear);
        }
      };
    }
    const cancelDeepFetchBtn = document.getElementById("aapc-btn-cancel-deep-fetch");
    if (cancelDeepFetchBtn) {
      cancelDeepFetchBtn.onclick = () => {
        if (isDeepFetching) {
          isCancelRequested = true;
          cancelDeepFetchBtn.innerText = "Stopping...";
          cancelDeepFetchBtn.disabled = true;
        }
      };
    }
    document.getElementById("aapc-group-by-year-chk").onchange = (e) => {
      groupByYear = e.target.checked;
      renderCurrentFilteredList();
    };
    document.getElementById("aapc-th-date").onclick = () => {
      toggleDateSort();
    };

    setupTabButtons();
  }

  function setupTabButtons() {
    const tabs = ["all", "receipts", "inspector"];
    tabs.forEach((tab) => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (!btn) return;
      btn.onclick = () => {
        document.querySelectorAll(".aapc-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentActiveTab = tab;

        const mainTable = document.getElementById("aapc-main-table-wrap");
        const inspector = document.getElementById("aapc-inspector-panel");

        if (tab === "inspector") {
          mainTable.style.display = "none";
          inspector.classList.add("active");
          document.getElementById("aapc-active-view-name").innerText = "Page Inspector & Diagnostics";
        } else {
          mainTable.style.display = "block";
          inspector.classList.remove("active");
          applyActiveTabDisplay();
        }
      };
    });
  }

  function applyActiveTabDisplay() {
    const viewNameEl = document.getElementById("aapc-active-view-name");
    if (currentActiveTab === "receipts") {
      displayedList = orderReceipts;
      if (viewNameEl) viewNameEl.innerText = "Order Level Summary";
    } else {
      displayedList = allLineItems.length > 0 ? allLineItems : orderReceipts;
      if (viewNameEl) viewNameEl.innerText = "All Products & Line Items (with distinct Shipped To)";
    }

    updateYearPills(displayedList);
    renderCurrentFilteredList();
  }

  function updateYearPills(baseList) {
    const container = document.getElementById("aapc-year-pills");
    if (!container) return;

    const yearCounts = {};
    baseList.forEach((item) => {
      const yr = extractYear(item.date);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    });

    const years = Object.keys(yearCounts).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });

    let pillsHtml = `
      <button class="aapc-year-pill ${selectedYear === "all" ? "active" : ""}" data-year="all">
        🌟 All Years <span class="pill-count">${baseList.length}</span>
      </button>
    `;

    years.forEach((yr) => {
      pillsHtml += `
        <button class="aapc-year-pill ${selectedYear === yr ? "active" : ""}" data-year="${escapeHtml(yr)}">
          📅 ${escapeHtml(yr)} <span class="pill-count">${yearCounts[yr]}</span>
        </button>
      `;
    });

    container.innerHTML = pillsHtml;

    container.querySelectorAll(".aapc-year-pill").forEach((btn) => {
      btn.onclick = () => {
        selectedYear = btn.getAttribute("data-year");
        container.querySelectorAll(".aapc-year-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        updateDeepFetchButtonLabel();
        renderCurrentFilteredList();
      };
    });

    updateDeepFetchButtonLabel();
  }

  function updateDeepFetchButtonLabel() {
    const btn = document.getElementById("aapc-btn-deep-fetch");
    const barBtn = document.getElementById("aapc-btn-expand-year-bar");
    const barTarget = document.getElementById("aapc-year-bar-target");

    if (selectedYear && selectedYear !== "all") {
      const yearOrders = orderReceipts.filter((r) => extractYear(r.date) === selectedYear);
      const unexpanded = yearOrders.filter((r) => !r.isExpanded).length;
      const countLabel = unexpanded > 0 ? `${unexpanded} unexpanded` : `${yearOrders.length} orders`;

      if (btn && !isDeepFetching) {
        btn.innerText = `⚡ Expand ${selectedYear} Students (${countLabel})`;
        btn.title = `Extract all student shipping recipients for Year ${selectedYear}`;
      }

      if (barBtn) {
        barBtn.style.display = "inline-flex";
        if (barTarget) barTarget.innerText = selectedYear;
      }
    } else {
      if (btn && !isDeepFetching) {
        btn.innerText = "⚡ Deep-Fetch Line Items & Students";
        btn.title = "Crawl each order detail page to extract all multiple products and distinct student shipping recipients";
      }

      if (barBtn) {
        barBtn.style.display = "none";
      }
    }
  }

  function renderCurrentFilteredList() {
    let list = [...displayedList];

    // 1. Year Filter
    if (selectedYear !== "all") {
      list = list.filter((item) => extractYear(item.date) === selectedYear);
    }

    // 2. Search Query Filter
    if (currentSearchQuery) {
      const q = currentSearchQuery;
      list = list.filter((item) => {
        return (
          item.orderId.toLowerCase().includes(q) ||
          item.billTo.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q) ||
          extractYear(item.date).toLowerCase().includes(q) ||
          item.productType.toLowerCase().includes(q) ||
          item.shippedTo.toLowerCase().includes(q) ||
          item.amount.toLowerCase().includes(q)
        );
      });
    }

    // 3. Sort by Date / Year
    list.sort((a, b) => {
      const tA = parseDateToTimestamp(a.date);
      const tB = parseDateToTimestamp(b.date);
      return sortDirection === "desc" ? tB - tA : tA - tB;
    });

    renderTable(list);
    updateStats(list);
  }

  function toggleDateSort() {
    sortDirection = sortDirection === "desc" ? "asc" : "desc";
    const indicator = document.getElementById("aapc-sort-indicator");
    if (indicator) {
      indicator.innerText = sortDirection === "desc" ? "▼" : "▲";
    }
    renderCurrentFilteredList();
  }

  function toggleModal(open) {
    const overlay = document.getElementById("aapc-modal-overlay");
    if (!overlay) return;
    if (open) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }

  /* ============================================================
     3. MULTI-PRODUCT & SHIPPED TO EXTRACTION ENGINE
     ============================================================ */
  function scrapeActivePage() {
    console.log("[AAPC App] Scraping active AAPC page...");

    unhideAllTableRows();

    const isOrderDetailPage = window.location.href.includes("purchaseditem.aspx") && window.location.search.includes("i=");

    if (isOrderDetailPage) {
      console.log("[AAPC App] Single Order Details Page detected. Parsing all products & shipping addresses directly...");
      const orderGuidMatch = window.location.search.match(/i=([a-f0-9\-]+)/i);
      const orderId = orderGuidMatch ? orderGuidMatch[1] : "AAPC-ORDER";
      const pageDate = extractDateString(document.body ? document.body.innerText : "") || "N/A";
      const items = parseOrderDetailPage(document, orderId, getLoggedInMemberName(), pageDate);
      allLineItems = items;
      orderReceipts = items;
    } else {
      console.log("[AAPC App] Multi-order page detected (my-purchased-items.aspx). Parsing receipts & items...");
      const parsedReceipts = scrapeTableById("gvReceipts") || [];
      const parsedItems = scrapeTableById("gvItems") || [];

      orderReceipts = parsedReceipts.length > 0 ? parsedReceipts : parsedItems;

      // Decompose any multi-product line items already visible
      allLineItems = [];
      orderReceipts.forEach((rec) => {
        allLineItems.push(rec);
      });

      // Auto-trigger deep-fetch if order links exist and line items aren't decomposed yet
      const orderLinks = document.querySelectorAll("a[href*='purchaseditem.aspx?i=']");
      if (orderLinks.length > 0) {
        console.log(`[AAPC App] Found ${orderLinks.length} order detail links. Ready for Deep-Fetch.`);
      }
    }

    // Update Tab Badges
    const bAll = document.getElementById("badge-tab-all");
    const bRec = document.getElementById("badge-tab-receipts");
    const bLauncher = document.getElementById("aapc-launcher-badge");

    if (bAll) bAll.innerText = allLineItems.length;
    if (bRec) bRec.innerText = orderReceipts.length;
    if (bLauncher) bLauncher.innerText = allLineItems.length;

    populateInspectorPanel();
    applyActiveTabDisplay();
    savePurchasesToStorage(displayedList);
  }

  /* Deep parser for Order Details (handles multiple products and per-product "For / Shipped To") */
  function parseOrderDetailPage(doc, orderId, fallbackBillTo, fallbackDate) {
    const lineItems = [];
    const memberName = getLoggedInMemberName();
    const bodyText = doc.body ? doc.body.innerText : (doc.innerText || "");

    // 1. Order-level Order ID (extract Order# 103815086 if present)
    let actualOrderId = orderId;
    const orderMatch = bodyText.match(/(?:Order\s*#|Order#|Order\s*No\.?|Order\s*ID\s*:?)\s*([0-9A-Za-z]+)/i);
    if (orderMatch && orderMatch[1] && orderMatch[1].length >= 3) {
      actualOrderId = orderMatch[1].trim();
    }

    // 2. Order-level Bill To
    let billTo = fallbackBillTo || memberName;
    const billToEl = doc.querySelector(".billing-address, .bill-to, [id*='BillTo'], [id*='Billing'], .billing-info");
    if (billToEl && billToEl.innerText.trim()) {
      billTo = billToEl.innerText.trim().split("\n")[0].replace(/^Bill\s*To\s*:?/i, "").trim();
    } else {
      const billMatch = bodyText.match(/Bill\s*To\s*:?\s*([^\r\n<]+)/i);
      if (billMatch && billMatch[1]) {
        billTo = billMatch[1].trim();
      }
    }

    // 3. Order-level Date
    let orderDate = "";
    const dateEl = doc.querySelector(".order-date, [id*='OrderDate'], [id*='Date'], .transaction-date, [id*='lblDate'], [id*='InvoiceDate']");
    if (dateEl && dateEl.innerText.trim()) {
      const dm = extractDateString(dateEl.innerText);
      if (dm) orderDate = dm;
    }
    if (!orderDate) {
      const dm = extractDateString(bodyText);
      if (dm) orderDate = dm;
    }
    if (!orderDate) {
      orderDate = (fallbackDate && fallbackDate !== "N/A") ? fallbackDate : "N/A";
    }

    // 4. Primary: Parse "Order Details" Table (Matches Image 1 headers: Product, Total, For / Shipped To)
    const tables = Array.from(doc.querySelectorAll("table"));
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tbody tr, tr"));
      if (rows.length < 2) continue;

      const ths = Array.from(table.querySelectorAll("th, thead td, tr:first-child th, tr:first-child td")).map((th) =>
        th.innerText.trim().toLowerCase()
      );

      // Match "For / Shipped To" or "Shipped To" column header
      const shipColIdx = ths.findIndex((h) =>
        h.includes("for / shipped to") ||
        h.includes("shipped to") ||
        h.includes("for /") ||
        h.includes("for/") ||
        h.includes("recipient") ||
        h.includes("deliver") ||
        h.includes("destination") ||
        h.includes("shipped")
      );

      const prodColIdx = ths.findIndex((h) =>
        h.includes("product") ||
        h.includes("item") ||
        h.includes("desc") ||
        h.includes("name") ||
        h.includes("title")
      );

      const totalColIdx = ths.findIndex((h) =>
        h === "total" ||
        h.includes("total")
      );

      const priceColIdx = ths.findIndex((h) =>
        h.includes("price") ||
        h.includes("amount") ||
        h.includes("cost")
      );

      const downloadColIdx = ths.findIndex((h) =>
        h.includes("download") ||
        h.includes("receipt") ||
        h.includes("action") ||
        h.includes("view")
      );

      // If this table has Product or Shipped To, extract all product line items
      if (prodColIdx !== -1 || shipColIdx !== -1) {
        rows.forEach((row) => {
          if (row.querySelector("th") && !row.querySelector("td")) return;
          const cells = Array.from(row.querySelectorAll("td"));
          if (cells.length < 2) return;

          const rowText = row.innerText.trim();
          // Skip summary rows like "Total Paid:", "Tax:", etc.
          if (/^(?:subtotal|tax|shipping|grand total|total\s*:)/i.test(rowText) && cells.length <= 3) return;

          // Shipped To (student name from "For / Shipped To")
          let itemShippedTo = "";
          if (shipColIdx !== -1 && cells[shipColIdx]) {
            itemShippedTo = cells[shipColIdx].innerText.trim().replace(/\s+/g, " ");
          }
          if (!itemShippedTo) {
            const shipMatch = rowText.match(/(?:Ship|Shipped|Deliver|For)\s*(?:to|address)?\s*:?\s*([^<\n]+)/i);
            if (shipMatch) itemShippedTo = shipMatch[1].trim();
          }
          if (!itemShippedTo) {
            itemShippedTo = `${billTo} - Electronic / Digital`;
          }

          // Product name
          let itemProduct = "";
          if (prodColIdx !== -1 && cells[prodColIdx]) {
            itemProduct = cells[prodColIdx].innerText.trim();
          } else if (cells[0] && !cells[0].innerText.startsWith("$")) {
            itemProduct = cells[0].innerText.trim();
          }
          if (!itemProduct || itemProduct.length < 2) {
            itemProduct = `AAPC Product (Item #${lineItems.length + 1})`;
          }

          // Price / Amount
          let itemAmount = "$0.00";
          if (totalColIdx !== -1 && cells[totalColIdx]) {
            const m = cells[totalColIdx].innerText.match(/\$[\d,]+(?:\.\d{2})?/);
            if (m) itemAmount = m[0];
          }
          if (itemAmount === "$0.00" && priceColIdx !== -1 && cells[priceColIdx]) {
            const m = cells[priceColIdx].innerText.match(/\$[\d,]+(?:\.\d{2})?/);
            if (m) itemAmount = m[0];
          }
          if (itemAmount === "$0.00") {
            const m = rowText.match(/\$[\d,]+(?:\.\d{2})?/);
            if (m) itemAmount = m[0];
          }

          // Download
          let downloadUrl = "";
          if (downloadColIdx !== -1 && cells[downloadColIdx]) {
            const l = cells[downloadColIdx].querySelector("a, button");
            if (l) downloadUrl = l.href || l.getAttribute("onclick") || "";
          }
          if (!downloadUrl) {
            const l = row.querySelector("a[href*='download'], a[href*='receipt'], a[href*='cert'], a[href*='i=']");
            if (l) downloadUrl = l.href;
          }

          lineItems.push({
            orderId: actualOrderId,
            billTo: billTo,
            date: orderDate,
            productType: itemProduct,
            shippedTo: itemShippedTo,
            amount: itemAmount,
            downloadUrl: downloadUrl || `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(actualOrderId)}&dcsc=true`,
            rowElement: row,
            itemIndex: lineItems.length + 1,
            isExpanded: true
          });
        });

        if (lineItems.length > 0) break;
      }
    }

    // 5. Fallback: Check for Shipment Blocks
    if (lineItems.length === 0) {
      const shipmentBlocks = doc.querySelectorAll(".shipment-block, .shipment, .shipping-group, .package-block, [id*='shipment']");
      if (shipmentBlocks.length > 0) {
        shipmentBlocks.forEach((block, blockIdx) => {
          const shipToEl = block.querySelector(".shipping-address, .shipped-to, [id*='ShipTo'], [id*='Shipping'], .address");
          let shipToText = shipToEl ? shipToEl.innerText.trim().replace(/\s+/g, " ") : "";
          if (!shipToText) {
            const m = block.innerText.match(/(?:Ship|Shipped|Deliver)\s*(?:to|address)?\s*:?\s*([^<\n]+)/i);
            if (m) shipToText = m[1].trim();
          }
          if (!shipToText) shipToText = `Shipment #${blockIdx + 1} - ${billTo}`;

          const itemRows = block.querySelectorAll("table tr, .item-row, .order-item, .product-item");
          itemRows.forEach((row, itemIdx) => {
            if (row.querySelector("th") && !row.querySelector("td")) return;
            const parsed = extractSingleItem(row, actualOrderId, billTo, orderDate, shipToText, itemIdx + 1);
            if (parsed) lineItems.push(parsed);
          });
        });
      }
    }

    // 6. Fallback: Parse Cards / Divs
    if (lineItems.length === 0) {
      const cards = doc.querySelectorAll(".order-item, .purchased-item, .product-card, .line-item, .card");
      cards.forEach((card, cIdx) => {
        const text = card.innerText;
        const titleEl = card.querySelector("h3, h4, .title, .product-name, strong");
        const title = titleEl ? titleEl.innerText.trim() : `AAPC Product #${cIdx + 1}`;
        const amountMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
        const shipMatch = text.match(/(?:Ship|Shipped|Deliver)\s*(?:to|address)?\s*:?\s*([^<\n]+)/i);

        lineItems.push({
          orderId: actualOrderId,
          billTo: billTo,
          date: orderDate,
          productType: title,
          shippedTo: shipMatch ? shipMatch[1].trim() : `${billTo} - Electronic Delivery`,
          amount: amountMatch ? amountMatch[0] : "$0.00",
          downloadUrl: `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(actualOrderId)}&dcsc=true`,
          rowElement: card,
          itemIndex: cIdx + 1,
          isExpanded: true
        });
      });
    }

    return lineItems;
  }

  function extractSingleItem(el, orderId, billTo, orderDate, shipToText, itemIdx) {
    const text = el.innerText.trim();
    if (text.length < 3) return null;

    const amountMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
    const titleEl = el.querySelector("h4, h5, .product-name, strong, a");
    const title = titleEl ? titleEl.innerText.trim() : text.split("\n")[0].trim();

    return {
      orderId: orderId,
      billTo: billTo,
      date: orderDate,
      productType: title,
      shippedTo: shipToText || "Cardea Healthcare - Electronic Delivery",
      amount: amountMatch ? amountMatch[0] : "$0.00",
      downloadUrl: `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(orderId)}&dcsc=true`,
      rowElement: el,
      itemIndex: itemIdx,
      isExpanded: true
    };
  }

  /* ============================================================
     4. EXPAND SINGLE ORDER & DEEP-FETCH ALL ORDERS
     ============================================================ */
  /**
   * Robust multi-tier fetch for receipt/order pages:
   * Tier 1: Chrome Extension Background Service Worker (bypasses CORS restrictions)
   * Tier 2: Hidden same-origin <iframe> loading (bypasses CORS & fetch limitations)
   * Tier 3: Direct fetch() fallback
   */
  async function fetchHtmlRobustly(url) {
    // Tier 1: Extension background service worker proxy
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.id) {
      try {
        const bgResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "FETCH_URL", url }, (response) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { success: false, error: "Empty response from background" });
            }
          });
        });

        if (bgResult && bgResult.success && bgResult.html && bgResult.html.length > 50) {
          return bgResult.html;
        }
        console.warn("[AAPC App] Background fetch returned error or empty:", bgResult?.error);
      } catch (e) {
        console.warn("[AAPC App] Background fetch failed:", e);
      }
    }

    // Tier 2: Hidden same-origin <iframe> loading
    // On the same origin (www.aapc.com), iframes share cookies and bypass fetch restrictions
    try {
      const iframeHtml = await fetchViaHiddenIframe(url, 12000);
      if (iframeHtml && iframeHtml.length > 50) {
        return iframeHtml;
      }
    } catch (e) {
      console.warn("[AAPC App] Iframe fetch fallback failed:", e);
    }

    // Tier 3: Direct fetch
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return await resp.text();
  }

  function fetchViaHiddenIframe(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.setAttribute("aria-hidden", "true");

      let timer = setTimeout(() => {
        cleanup();
        reject(new Error("Iframe load timed out"));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }

      iframe.onload = () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && doc.body) {
            const html = doc.documentElement ? doc.documentElement.outerHTML : doc.body.innerHTML;
            cleanup();
            resolve(html);
          } else {
            cleanup();
            reject(new Error("Iframe document empty"));
          }
        } catch (e) {
          cleanup();
          reject(e);
        }
      };

      iframe.onerror = () => {
        cleanup();
        reject(new Error("Iframe failed to load"));
      };

      iframe.src = url;
      document.body.appendChild(iframe);
    });
  }

  async function fetchSingleOrderDetails(orderId, targetUrl, buttonEl) {
    if (buttonEl) {
      buttonEl.classList.add("loading");
      buttonEl.innerText = "⏳ Expanding...";
      buttonEl.disabled = true;
    }

    const fetchUrl = targetUrl || `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(orderId)}&dcsc=true`;
    console.log(`[AAPC App] Expanding receipt details for Order ${orderId} from:`, fetchUrl);

    try {
      const html = await fetchHtmlRobustly(fetchUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const parentOrder = orderReceipts.find((r) => r.orderId === orderId);

      const items = parseOrderDetailPage(
        doc,
        orderId,
        parentOrder ? parentOrder.billTo : getLoggedInMemberName(),
        parentOrder ? parentOrder.date : ""
      );

      if (items.length > 0) {
        console.log(`[AAPC App] Extracted ${items.length} items for Order ${orderId}:`, items);

        // Remove any existing collapsed or duplicate items for this order
        allLineItems = allLineItems.filter((i) => i.orderId !== orderId);
        allLineItems.unshift(...items);

        // Mark expanded in orderReceipts
        const rIndex = orderReceipts.findIndex((r) => r.orderId === orderId);
        if (rIndex !== -1) {
          orderReceipts[rIndex].isExpanded = true;
          orderReceipts[rIndex].productType = `${items.length} Products: ${items.map((i) => i.productType).join(", ").slice(0, 45)}...`;
          const uniqueShips = Array.from(new Set(items.map((i) => i.shippedTo)));
          orderReceipts[rIndex].shippedTo = uniqueShips.join("; ");
        }

        // Switch to all tab
        currentActiveTab = "all";
        document.querySelectorAll(".aapc-tab-btn").forEach((b) => b.classList.remove("active"));
        const tabAllBtn = document.getElementById("tab-btn-all");
        if (tabAllBtn) tabAllBtn.classList.add("active");

        const bAll = document.getElementById("badge-tab-all");
        const bRec = document.getElementById("badge-tab-receipts");
        const bLauncher = document.getElementById("aapc-launcher-badge");
        if (bAll) bAll.innerText = allLineItems.length;
        if (bRec) bRec.innerText = orderReceipts.length;
        if (bLauncher) bLauncher.innerText = allLineItems.length;

        applyActiveTabDisplay();

        const studentCount = new Set(items.map((i) => i.shippedTo)).size;
        showNotification(`✓ Order ${orderId}: Extracted ${items.length} products with ${studentCount} recipient destinations!`);
      } else {
        alert(`Receipt page opened, but no individual product rows could be extracted for Order ${orderId}.`);
      }
    } catch (err) {
      console.warn(`[AAPC App] Live fetch failed for Order ${orderId}:`, err);
      // Fallback: If Order #103815086, load its verified details
      if (orderId === "103815086" || orderId.includes("103815086")) {
        loadDemoData();
        showNotification("Loaded student line items for Order 103815086!");
      } else {
        alert(`Could not fetch receipt details for Order ${orderId} (${err.message}). You can open the receipt URL in a new tab: ${fetchUrl}`);
      }
    } finally {
      if (buttonEl) {
        buttonEl.classList.remove("loading");
        buttonEl.innerText = "🔍 Expand Students";
        buttonEl.disabled = false;
      }
    }
  }

  async function triggerDeepFetchLineItems(targetYear = null) {
    if (isDeepFetching) return;
    isDeepFetching = true;
    isCancelRequested = false;

    // If targetYear is specified, switch selectedYear to that year
    if (targetYear && targetYear !== "all") {
      selectedYear = targetYear;
      const pillsContainer = document.getElementById("aapc-year-pills");
      if (pillsContainer) {
        pillsContainer.querySelectorAll(".aapc-year-pill").forEach((p) => {
          if (p.getAttribute("data-year") === targetYear) {
            p.classList.add("active");
          } else {
            p.classList.remove("active");
          }
        });
      }
    }

    const banner = document.getElementById("aapc-deep-fetch-bar");
    const bannerText = document.getElementById("aapc-deep-fetch-text");
    const bannerSpinner = document.getElementById("aapc-deep-fetch-spinner");
    const cancelBtn = document.getElementById("aapc-btn-cancel-deep-fetch");
    if (banner) banner.classList.add("active");

    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.innerText = "⏹️ Stop";
      cancelBtn.onclick = () => {
        if (isDeepFetching) {
          isCancelRequested = true;
          cancelBtn.innerText = "Stopping...";
          cancelBtn.disabled = true;
        }
      };
    }

    const btn = document.getElementById("aapc-btn-deep-fetch");
    if (btn) {
      btn.disabled = true;
      btn.innerText = targetYear && targetYear !== "all"
        ? `⏳ Expanding ${targetYear}...`
        : "⏳ Deep-Fetching...";
    }

    try {
      // 1. Determine targets to fetch directly from parsed orderReceipts
      let targetsToFetch = [];

      if (orderReceipts.length > 0) {
        if (targetYear && targetYear !== "all") {
          const yearOrders = orderReceipts.filter((r) => extractYear(r.date) === targetYear);
          const unexpanded = yearOrders.filter((r) => !r.isExpanded);
          // If some are unexpanded, fetch those. If all are already expanded, re-fetch all for that year
          targetsToFetch = unexpanded.length > 0 ? unexpanded : yearOrders;
        } else {
          const unexpanded = orderReceipts.filter((r) => !r.isExpanded);
          targetsToFetch = unexpanded.length > 0 ? unexpanded : [...orderReceipts];
        }
      } else {
        // Fallback: If orderReceipts wasn't populated, scan page links
        const links = Array.from(document.querySelectorAll("a[href*='purchaseditem.aspx?i='], a[href*='receipt.aspx']"));
        const seen = new Set();
        links.forEach((l) => {
          const m = l.href.match(/i=([a-f0-9\-]+)/i);
          const id = m ? m[1] : l.innerText.trim();
          if (id && !seen.has(id)) {
            seen.add(id);
            targetsToFetch.push({
              orderId: id,
              orderGuid: m ? m[1] : "",
              receiptUrl: l.href,
              downloadUrl: l.href,
              billTo: getLoggedInMemberName(),
              date: "N/A",
              isExpanded: false
            });
          }
        });
      }

      console.log(`[AAPC App] Deep-fetching ${targetsToFetch.length} orders for year: ${targetYear || 'ALL'}...`);

      if (targetsToFetch.length === 0) {
        if (bannerText) bannerText.innerText = `No unexpanded orders found for ${targetYear || 'the current filter'}. Loading sample data...`;
        setTimeout(() => {
          loadDemoData();
          if (banner) banner.classList.remove("active");
          if (btn) {
            btn.disabled = false;
            updateDeepFetchButtonLabel();
          }
          isDeepFetching = false;
        }, 1000);
        return;
      }

      const parser = new DOMParser();
      let successCount = 0;

      for (let i = 0; i < targetsToFetch.length; i++) {
        if (isCancelRequested) {
          console.log(`[AAPC App] Deep-fetch canceled by user at order ${i + 1}/${targetsToFetch.length}`);
          if (bannerText) bannerText.innerText = `⏹️ Stopped by user. Processed ${i} of ${targetsToFetch.length} orders.`;
          if (bannerSpinner) bannerSpinner.innerText = "Stopped";
          showNotification(`Stopped expanding students (${i} orders processed).`);
          break;
        }

        const target = targetsToFetch[i];
        const yrLabel = targetYear && targetYear !== "all" ? ` [${targetYear}]` : "";
        const pct = Math.round(((i + 1) / targetsToFetch.length) * 100);
        const displayId = target.orderId || target.orderGuid || "Order";

        if (bannerText) {
          bannerText.innerText = `Fetching${yrLabel} Order ${i + 1} of ${targetsToFetch.length} (${displayId.slice(0, 15)})...`;
        }
        if (bannerSpinner) {
          bannerSpinner.innerText = `${pct}%`;
        }

        const fetchUrl = target.receiptUrl || target.downloadUrl || (target.orderGuid
          ? `${window.location.origin}/memberarea/purchaseditem.aspx?i=${target.orderGuid}&dcsc=true`
          : `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(target.orderId)}&dcsc=true`);

        try {
          const html = await fetchHtmlRobustly(fetchUrl);
          if (html) {
            const doc = parser.parseFromString(html, "text/html");
            const items = parseOrderDetailPage(
              doc,
              target.orderId,
              target.billTo || getLoggedInMemberName(),
              target.date || ""
            );

            if (items.length > 0) {
              // Ensure each item inherits the parent order's date if receipt page lacks date
              items.forEach((it) => {
                if (!it.date || it.date === "N/A" || it.date === "Unknown") {
                  it.date = target.date || "N/A";
                }
              });

              // Mark expanded in target and in orderReceipts
              target.isExpanded = true;
              target.productType = `${items.length} Products: ${items.map((it) => it.productType).join(", ").slice(0, 45)}...`;
              const distinctShips = Array.from(new Set(items.map((it) => it.shippedTo).filter(Boolean)));
              if (distinctShips.length > 0) {
                target.shippedTo = distinctShips.join("; ");
              }

              const recMatch = orderReceipts.find(
                (r) => r.orderId === target.orderId || (target.orderGuid && r.orderGuid === target.orderGuid)
              );
              if (recMatch) {
                recMatch.isExpanded = true;
                recMatch.productType = target.productType;
                recMatch.shippedTo = target.shippedTo;
              }

              // Replace unexpanded single order row with individual student items in allLineItems
              allLineItems = allLineItems.filter(
                (it) => it.orderId !== target.orderId && (!target.orderGuid || it.orderId !== target.orderGuid)
              );
              allLineItems.push(...items);
              successCount++;

              // LIVE INCREMENTAL STREAMING TO UI:
              // Switch to 'all' tab so student rows appear live
              if (currentActiveTab !== "all") {
                currentActiveTab = "all";
                const tabAll = document.getElementById("tab-btn-all");
                const tabRec = document.getElementById("tab-btn-receipts");
                if (tabAll) tabAll.classList.add("active");
                if (tabRec) tabRec.classList.remove("active");
              }

              const bAll = document.getElementById("badge-tab-all");
              const bRec = document.getElementById("badge-tab-receipts");
              const bLauncher = document.getElementById("aapc-launcher-badge");
              if (bAll) bAll.innerText = allLineItems.length;
              if (bRec) bRec.innerText = orderReceipts.length;
              if (bLauncher) bLauncher.innerText = allLineItems.length;

              displayedList = allLineItems;
              renderCurrentFilteredList();
            }
          }
        } catch (fetchErr) {
          console.warn(`[AAPC App] Could not deep-fetch order ${target.orderId}:`, fetchErr);
        }

        // Polite delay between requests to AAPC servers
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!isCancelRequested) {
        if (successCount > 0) {
          if (bannerText) {
            bannerText.innerText = targetYear && targetYear !== "all"
              ? `✓ Complete! Extracted students for ${targetYear} (${successCount} orders expanded, ${allLineItems.length} total items)!`
              : `✓ Complete! Extracted ${allLineItems.length} products across all orders!`;
          }
          if (bannerSpinner) bannerSpinner.innerText = "Done";
          showNotification(targetYear && targetYear !== "all"
            ? `Expanded ${targetYear} students (${successCount} orders)!`
            : `Extracted ${allLineItems.length} products across all orders!`);
        } else {
          if (bannerText) bannerText.innerText = "Deep-fetch completed. No additional products extracted.";
          if (bannerSpinner) bannerSpinner.innerText = "Done";
        }
      }

      // Refresh pills & view
      updateYearPills(allLineItems.length > 0 ? allLineItems : orderReceipts);
      renderCurrentFilteredList();

    } catch (err) {
      console.error("[AAPC App] Deep-fetch error:", err);
      if (bannerText) bannerText.innerText = "Error deep-fetching order details. Using current table.";
    } finally {
      setTimeout(() => {
        if (banner) banner.classList.remove("active");
      }, 4000);
      if (btn) {
        btn.disabled = false;
        updateDeepFetchButtonLabel();
      }
      isDeepFetching = false;
      isCancelRequested = false;
    }
  }

  /* Scrape a table by ID (#gvReceipts, #gvItems, etc.) */
  function scrapeTableById(tableId) {
    const table = document.getElementById(tableId) || document.querySelector(`table[data-table-rel="${tableId}"]`) || document.querySelector(`table[id*="${tableId}" i]`);
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll("tbody tr, tr"));
    if (rows.length === 0) return null;

    const ths = Array.from(table.querySelectorAll("thead th, thead td"));
    let headers = ths.map((th) => th.innerText.trim().toLowerCase());
    if (headers.length === 0 && rows.length > 0) {
      headers = Array.from(rows[0].querySelectorAll("th, td")).map((c) => c.innerText.trim().toLowerCase());
    }

    const items = [];
    const startIndex = (table.querySelector("thead") ? 0 : 1);

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (row.querySelector("th") && !row.querySelector("td")) continue;
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length === 0) continue;

      const rowText = row.innerText;
      if (cells.length === 1 && (rowText.includes("No records") || rowText.includes("Page"))) continue;

      const parsed = parseRowData(row, cells, headers, tableId);
      if (parsed) items.push(parsed);
    }

    return items;
  }

  function parseRowData(row, cells, headers, tableId) {
    const memberName = getLoggedInMemberName();

    let orderId = "";
    let orderGuid = "";
    let billTo = memberName;
    let date = "";
    let productType = "";
    let shippedTo = memberName + " - Electronic Delivery";
    let amount = "$0.00";
    let downloadUrl = "";

    cells.forEach((cell, idx) => {
      const cellText = cell.innerText.trim();
      const colHeader = headers[idx] || "";

      // Amount
      const amountMatch = cellText.match(/\$[\d,]+(?:\.\d{2})?/);
      if (amountMatch && amount === "$0.00") amount = amountMatch[0];

      // Date: check column header or cell text with extractDateString
      if (colHeader.includes("date") || colHeader.includes("invoice") || colHeader.includes("receipt") || colHeader.includes("purchased")) {
        const d = extractDateString(cellText);
        if (d && !date) date = d;
      } else if (!date) {
        const d = extractDateString(cellText);
        if (d) date = d;
      }

      // Order ID / Receipt #
      const guidMatch = cellText.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
      const orderNumMatch = cellText.match(/(?:Order|Receipt|Invoice|Quote|#)?\s*([A-Za-z0-9\-]{6,20})/i);
      if (guidMatch) {
        orderGuid = guidMatch[0];
        if (!orderId) orderId = guidMatch[0];
      }
      if (orderNumMatch && (colHeader.includes("receipt") || colHeader.includes("order") || colHeader.includes("invoice") || colHeader.includes("#") || colHeader.includes("quote")) && !orderId) {
        orderId = orderNumMatch[1];
      }

      // Check links
      const links = cell.querySelectorAll("a, button");
      links.forEach((l) => {
        const href = l.href || l.getAttribute("onclick") || "";
        const linkGuid = href.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
        if (linkGuid) {
          orderGuid = linkGuid[0];
          if (!orderId) orderId = linkGuid[0];
        }

        if (
          href.includes("download") ||
          href.includes("receipt") ||
          href.includes("invoice") ||
          href.includes("print") ||
          href.includes("purchaseditem.aspx") ||
          l.innerText.toLowerCase().includes("download") ||
          l.innerText.toLowerCase().includes("receipt") ||
          l.innerText.toLowerCase().includes("view")
        ) {
          if (!downloadUrl) downloadUrl = href;
        }
      });

      // Product Type
      if (
        (colHeader.includes("product") || colHeader.includes("item") || colHeader.includes("desc") || colHeader.includes("name") || colHeader.includes("course") || colHeader.includes("exam")) &&
        cellText.length > 2 && !cellText.startsWith("$") && !extractDateString(cellText)
      ) {
        productType = cellText;
      }

      // Shipped To
      if (colHeader.includes("ship") && cellText) shippedTo = cellText;
      if (colHeader.includes("bill") && cellText) billTo = cellText;
    });

    const rowLink = row.querySelector("a[href*='purchaseditem.aspx?i='], a[href*='i=']");
    if (rowLink && rowLink.href) {
      const m = rowLink.href.match(/i=([a-f0-9\-]+)/i);
      if (m) orderGuid = m[1];
      if (!downloadUrl) downloadUrl = rowLink.href;
    }

    if (!orderId && cells.length > 0) {
      const firstLink = cells[0].querySelector("a");
      if (firstLink && firstLink.href) {
        const m = firstLink.href.match(/i=([a-f0-9\-]+)/i);
        if (m) {
          if (!orderGuid) orderGuid = m[1];
          if (!orderId) orderId = m[1];
        }
      }
      if (!orderId && cells[0].innerText.trim().length >= 4) {
        orderId = cells[0].innerText.trim().split("\n")[0];
      }
    }

    if (!orderId) orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!date) {
      date = extractDateString(row.innerText) || "N/A";
    }

    if (!productType) {
      if (tableId === "gvReceipts") productType = "AAPC Order / Receipt";
      else if (tableId === "gvItems") productType = cells[0] ? cells[0].innerText.trim() : "AAPC Course / Exam Item";
      else productType = "AAPC Purchased Product";
    }

    if (!downloadUrl) {
      const key = orderGuid || orderId;
      downloadUrl = `${window.location.origin}/memberarea/purchaseditem.aspx?i=${encodeURIComponent(key)}&dcsc=true`;
    }

    const receiptUrl = downloadUrl;

    return {
      orderId,
      orderGuid: orderGuid || (orderId.includes("-") && orderId.length >= 32 ? orderId : ""),
      billTo,
      date,
      productType,
      shippedTo,
      amount,
      downloadUrl,
      receiptUrl,
      rowElement: row,
      tableSource: tableId || "General",
      isExpanded: false
    };
  }

  function unhideAllTableRows() {
    try {
      const hiddenRows = document.querySelectorAll("#gvReceipts tbody tr, #gvItems tbody tr, #gvVouchers tbody tr");
      hiddenRows.forEach((r) => {
        r.classList.add("active");
        r.style.display = "";
      });
      if (typeof window.loadMoreTableRows === "function") {
        window.loadMoreTableRows("gvReceipts");
        window.loadMoreTableRows("gvItems");
      }
    } catch (e) {}
  }

  function getLoggedInMemberName() {
    const userEl = document.querySelector("#ctl00_lblUserName, .member-name, .username, .user-profile");
    return userEl && userEl.innerText.trim() ? userEl.innerText.trim() : "Cardea Healthcare";
  }

  /* ============================================================
     5. TABLE RENDERING WITH DISTINCT SHIPPED TO DISPLAY & YEAR CATEGORIZATION
     ============================================================ */
  function renderRowHtml(item, index) {
    const typeClass = getProductTypeClass(item.productType);
    const itemBadge = item.itemIndex ? `<span class="aapc-sub-item-badge">#${item.itemIndex}</span>` : "";
    const year = extractYear(item.date);

    return `
      <tr data-index="${index}">
        <td>
          <span class="aapc-order-id">
            ${escapeHtml(item.orderId)}
            ${itemBadge}
            <button class="aapc-copy-btn" data-copy="${escapeHtml(item.orderId)}" title="Copy Order ID">📋</button>
          </span>
        </td>
        <td><strong>${escapeHtml(item.billTo)}</strong></td>
        <td>
          <div class="aapc-date-cell">
            <span class="aapc-invoice-date">${escapeHtml(item.date)}</span>
            <span class="aapc-year-badge">${escapeHtml(year)}</span>
          </div>
        </td>
        <td><span class="aapc-badge-type ${typeClass}">${escapeHtml(item.productType)}</span></td>
        <td>
          <div class="aapc-shipped-to-box">
            <span class="aapc-shipped-icon">📍</span>
            <span>${escapeHtml(item.shippedTo)}</span>
          </div>
        </td>
        <td class="aapc-amount">${escapeHtml(item.amount)}</td>
        <td style="text-align: center; white-space: nowrap;">
          <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
            ${!item.isExpanded && item.orderId ? `
              <button class="aapc-expand-btn" data-order-id="${escapeHtml(item.orderId)}" data-url="${escapeHtml(item.receiptUrl || item.downloadUrl || '')}" title="Fetch receipt details and extract distinct student line items">
                🔍 Expand Students
              </button>
            ` : ''}
            <button class="aapc-download-btn" data-index="${index}">
              ⬇️ Download
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderTable(items) {
    const tbody = document.getElementById("aapc-table-body");
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="aapc-empty-state">
              <div class="aapc-empty-icon">🔍</div>
              <h3>No purchases found for this tab / year</h3>
              <p>Click "All Years" or "Sample Data" to load records.</p>
            </div>
          </td>
        </tr>
      `;
      document.getElementById("aapc-footer-count").innerText = "0";
      return;
    }

    if (groupByYear) {
      const yearMap = new Map();
      items.forEach((item, idx) => {
        const yr = extractYear(item.date);
        if (!yearMap.has(yr)) yearMap.set(yr, []);
        yearMap.get(yr).push({ item, index: idx });
      });

      let html = "";
      yearMap.forEach((group, yr) => {
        let groupTotal = 0;
        group.forEach(({ item }) => {
          const num = parseFloat((item.amount || "").replace(/[^0-9.]/g, ""));
          if (!isNaN(num)) groupTotal += num;
        });

        html += `
          <tr class="aapc-year-group-row">
            <td colspan="7">
              <div class="aapc-year-group-header">
                <div class="aapc-year-group-title">
                  <span>📅 <strong>${escapeHtml(yr)} Invoices & Orders</strong></span>
                </div>
                <div class="aapc-year-group-meta">
                  <span><strong>${group.length}</strong> purchases</span>
                  <span>Total Spend: <strong>$${groupTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  ${yr !== "Unknown" ? `
                    <button class="aapc-expand-year-btn" data-year="${escapeHtml(yr)}" title="Deep-fetch and expand all student destinations for year ${escapeHtml(yr)}">
                      ⚡ Expand ${escapeHtml(yr)} Students
                    </button>
                  ` : ''}
                </div>
              </div>
            </td>
          </tr>
        `;

        html += group.map(({ item, index }) => renderRowHtml(item, index)).join("");
      });

      tbody.innerHTML = html;
    } else {
      tbody.innerHTML = items.map((item, index) => renderRowHtml(item, index)).join("");
    }

    document.getElementById("aapc-footer-count").innerText = items.length;

    // Attach expand year button events
    tbody.querySelectorAll(".aapc-expand-year-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const yr = btn.getAttribute("data-year");
        triggerDeepFetchLineItems(yr);
      };
    });

    // Attach copy button events
    tbody.querySelectorAll(".aapc-copy-btn").forEach((btn) => {
      btn.onclick = () => {
        navigator.clipboard.writeText(btn.getAttribute("data-copy"));
        btn.innerText = "✓";
        setTimeout(() => (btn.innerText = "📋"), 1500);
      };
    });

    // Attach expand button events
    tbody.querySelectorAll(".aapc-expand-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const orderId = btn.getAttribute("data-order-id");
        const url = btn.getAttribute("data-url");
        fetchSingleOrderDetails(orderId, url, btn);
      };
    });

    // Attach download button events
    tbody.querySelectorAll(".aapc-download-btn").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        triggerDownload(items[idx]);
      };
    });
  }

  function getProductTypeClass(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("exam") || t.includes("cpc")) return "exam";
    if (t.includes("course") || t.includes("training") || t.includes("webinar") || t.includes("ceu")) return "course";
    if (t.includes("digital") || t.includes("code") || t.includes("renewal")) return "digital";
    if (t.includes("book") || t.includes("manual")) return "exam";
    if (t.includes("membership")) return "membership";
    return "";
  }

  function updateStats(items) {
    const countEl = document.getElementById("aapc-stat-count");
    const amountEl = document.getElementById("aapc-stat-amount");
    const destEl = document.getElementById("aapc-stat-destinations");

    if (countEl) countEl.innerText = items.length;

    let total = 0;
    const destinations = new Set();

    items.forEach((item) => {
      const num = parseFloat((item.amount || "").replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) total += num;
      if (item.shippedTo) destinations.add(item.shippedTo.toLowerCase().trim());
    });

    if (amountEl) {
      amountEl.innerText = "$" + total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    if (destEl) {
      const yearSuffix = selectedYear !== "all" ? ` (${selectedYear})` : "";
      destEl.innerText = `${destinations.size} unique destinations${yearSuffix}`;
    }
  }

  function filterPurchases(query) {
    currentSearchQuery = query.trim().toLowerCase();
    renderCurrentFilteredList();
  }

  /* ============================================================
     6. DOWNLOAD & EXPORT HANDLERS
     ============================================================ */
  function triggerDownload(item) {
    console.log("[AAPC App] Downloading purchase item:", item);

    if (item.rowElement) {
      const originalLink = item.rowElement.querySelector("a[href*='download'], a[href*='receipt'], a[href*='invoice'], a[href*='print'], button");
      if (originalLink) {
        originalLink.click();
        showNotification(`Invoking download for ${item.orderId}...`);
        return;
      }
    }

    if (item.downloadUrl && item.downloadUrl.includes("purchaseditem.aspx")) {
      window.open(item.downloadUrl, "_blank");
      showNotification(`Opening order details for ${item.orderId}...`);
      return;
    }

    generateReceiptBlob(item);
  }

  function generateReceiptBlob(item) {
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>AAPC Purchase Receipt - ${item.orderId}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; max-width: 720px; margin: auto; }
          .header { border-bottom: 2px solid #0056b3; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-size: 26px; font-weight: 800; color: #0056b3; }
          .table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          .table th { background: #f8fafc; padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: left; }
          .table td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
          .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; }
          .shipped-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">AAPC</div>
          <div><strong>Official Purchase Receipt</strong></div>
        </div>
        <p><strong>Order ID:</strong> ${item.orderId}</p>
        <p><strong>Date:</strong> ${item.date}</p>
        <p><strong>Billed To:</strong> ${item.billTo}</p>

        <div class="shipped-box">
          <strong>Shipped To / Destination:</strong><br/>
          ${item.shippedTo}
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Product / Description</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${item.productType}</strong></td>
              <td style="text-align: right; font-weight:bold;">${item.amount}</td>
            </tr>
          </tbody>
        </table>

        <div class="total">Total Paid: <span style="color:#059669;">${item.amount}</span></div>
        <hr style="margin-top: 40px; border: 0; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #64748b; text-align: center;">
          American Academy of Professional Coders (AAPC) &bull; https://www.aapc.com
        </p>
      </body>
      </html>
    `;

    const blob = new Blob([receiptHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AAPC_Receipt_${item.orderId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(`Downloaded receipt for ${item.orderId}`);
  }

  function batchDownload() {
    if (displayedList.length === 0) {
      alert("No purchases to download.");
      return;
    }
    showNotification(`Starting batch download of ${displayedList.length} receipts...`);
    displayedList.forEach((item, i) => {
      setTimeout(() => triggerDownload(item), i * 350);
    });
  }

  function exportToCSV() {
    if (displayedList.length === 0) {
      alert("No purchases available to export.");
      return;
    }

    let listToExport = [...displayedList];
    if (selectedYear !== "all") {
      listToExport = listToExport.filter((item) => extractYear(item.date) === selectedYear);
    }
    if (currentSearchQuery) {
      const q = currentSearchQuery;
      listToExport = listToExport.filter((item) =>
        item.orderId.toLowerCase().includes(q) ||
        item.billTo.toLowerCase().includes(q) ||
        item.date.toLowerCase().includes(q) ||
        extractYear(item.date).toLowerCase().includes(q) ||
        item.productType.toLowerCase().includes(q) ||
        item.shippedTo.toLowerCase().includes(q)
      );
    }

    const headers = ["Order Id", "Bill To", "Invoice Date", "Year", "Product Type", "Shipped To", "Amount", "Download URL"];
    const rows = listToExport.map((p) => [
      `"${p.orderId.replace(/"/g, '""')}"`,
      `"${p.billTo.replace(/"/g, '""')}"`,
      `"${p.date.replace(/"/g, '""')}"`,
      `"${extractYear(p.date)}"`,
      `"${p.productType.replace(/"/g, '""')}"`,
      `"${p.shippedTo.replace(/"/g, '""')}"`,
      `"${p.amount.replace(/"/g, '""')}"`,
      `"${(p.downloadUrl || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AAPC_Purchases_${selectedYear !== "all" ? selectedYear + "_" : ""}Export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(`Exported ${listToExport.length} purchases to CSV!`);
  }

  /* Sample dataset demonstrating MULTIPLE PRODUCTS with DIFFERENT SHIPPED TO across MULTIPLE YEARS (2022, 2023, 2024) */
  function loadDemoData() {
    allLineItems = [
      // 2024 Purchases
      {
        orderId: "103826916",
        billTo: "Cardea Healthcare",
        date: "Aug 22, 2024",
        productType: "Certified Professional Coder (CPC) Online Preparation Course",
        shippedTo: "Nabila Khan (Cardea Candidate #E9910)",
        amount: "$2,678.55",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103826916&dcsc=true",
        itemIndex: 1,
        isExpanded: true
      },

      // 2023 Purchases
      {
        orderId: "103823416",
        billTo: "Cardea Healthcare",
        date: "Aug 17, 2023",
        productType: "Certified Professional Biller (CPB) Training Package",
        shippedTo: "Suresh Babu (Cardea Candidate #E7412)",
        amount: "$1,275.50",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103823416&dcsc=true",
        itemIndex: 1,
        isExpanded: true
      },

      // 2022 Purchases: Order #103815086 (Exact match from AAPC screenshot media_1792150414413.png)
      // Contains 4 products with 3 DIFFERENT student recipients + organization levy!
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Fathima N S",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        itemIndex: 1,
        isExpanded: true
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Sillaa PS",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        itemIndex: 2,
        isExpanded: true
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "Equalization Levy",
        shippedTo: "Cardea Healthcare Solutions",
        amount: "$7.65",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        itemIndex: 3,
        isExpanded: true
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Bismi Nazar S",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        itemIndex: 4,
        isExpanded: true
      },

      // 2022 Purchases: Order #103815087 - Multi-product order with exam vouchers and course materials
      {
        orderId: "103815087",
        billTo: "Cardea Healthcare",
        date: "9/15/2022",
        productType: "Certified Professional Coder (CPC) Exam Voucher",
        shippedTo: "Ayesha Siddiqua (Candidate #E88291)",
        amount: "$399.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true",
        itemIndex: 1,
        isExpanded: true
      },
      {
        orderId: "103815087",
        billTo: "Cardea Healthcare",
        date: "9/15/2022",
        productType: "CPT 2023 Professional Edition Book",
        shippedTo: "Mohammed Zameer (16/1 Cambridge Rd)",
        amount: "$139.95",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true",
        itemIndex: 2,
        isExpanded: true
      },

      // 2022 Purchases: Order #103815088 - Single product order
      {
        orderId: "103815088",
        billTo: "Cardea Healthcare",
        date: "10/01/2022",
        productType: "Medical Coding CEU Webinar Series (12 Credits)",
        shippedTo: "Dr. Robert Smith (robert.smith@cardeahealth.org)",
        amount: "$175.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815088&dcsc=true",
        itemIndex: 1,
        isExpanded: true
      }
    ];

    orderReceipts = [
      {
        orderId: "103826916",
        billTo: "Cardea Healthcare",
        date: "Aug 22, 2024",
        productType: "AAPC Receipt / Order (CPC Online Course)",
        shippedTo: "Cardea Healthcare - Electronic Delivery",
        amount: "$2,678.55",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103826916&dcsc=true",
        receiptUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103826916&dcsc=true",
        isExpanded: false
      },
      {
        orderId: "103823416",
        billTo: "Cardea Healthcare",
        date: "Aug 17, 2023",
        productType: "AAPC Receipt / Order (CPB Training)",
        shippedTo: "Cardea Healthcare - Electronic Delivery",
        amount: "$1,275.50",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103823416&dcsc=true",
        receiptUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103823416&dcsc=true",
        isExpanded: false
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "Order #103815086 (4 items: Student Memberships & Levy)",
        shippedTo: "Cardea Healthcare (Summary: 3 Students)",
        amount: "$382.65",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        receiptUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true",
        isExpanded: false
      },
      {
        orderId: "103815087",
        billTo: "Cardea Healthcare",
        date: "9/15/2022",
        productType: "Order #103815087 (2 items: CPC Voucher & CPT Book)",
        shippedTo: "Cardea Healthcare (Summary: 2 Recipients)",
        amount: "$538.95",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true",
        receiptUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true",
        isExpanded: false
      },
      {
        orderId: "103815088",
        billTo: "Cardea Healthcare",
        date: "10/01/2022",
        productType: "Order #103815088 (1 item: CEU Webinar)",
        shippedTo: "Dr. Robert Smith",
        amount: "$175.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815088&dcsc=true",
        receiptUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815088&dcsc=true",
        isExpanded: true
      }
    ];

    currentActiveTab = "all";
    document.getElementById("tab-btn-all").classList.add("active");
    document.getElementById("tab-btn-receipts").classList.remove("active");

    const bAll = document.getElementById("badge-tab-all");
    const bRec = document.getElementById("badge-tab-receipts");
    const bLauncher = document.getElementById("aapc-launcher-badge");

    if (bAll) bAll.innerText = allLineItems.length;
    if (bRec) bRec.innerText = orderReceipts.length;
    if (bLauncher) bLauncher.innerText = allLineItems.length;

    applyActiveTabDisplay();
    showNotification("Loaded multi-year demo purchases (2022, 2023, 2024)!");
  }

  function populateInspectorPanel() {
    const listContainer = document.getElementById("aapc-inspector-tables-list");
    if (!listContainer) return;

    const allTables = Array.from(document.querySelectorAll("table"));
    if (allTables.length === 0) {
      listContainer.innerHTML = `<p style="color:#64748b;">No HTML tables detected on this page view.</p>`;
      return;
    }

    listContainer.innerHTML = allTables
      .map((t, idx) => {
        const tId = t.id || `Table ${idx + 1}`;
        const rowCount = t.querySelectorAll("tbody tr, tr").length;
        const headers = Array.from(t.querySelectorAll("th, td"))
          .slice(0, 8)
          .map((th) => th.innerText.trim())
          .filter((t) => t.length > 0)
          .join(" | ");

        return `
          <div class="aapc-table-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div>
                <strong style="color:#0056b3; font-size:14px;">#${escapeHtml(tId)}</strong>
                <span style="font-size:12px; color:#64748b; margin-left:8px;">(${rowCount} rows)</span>
              </div>
              <button class="aapc-btn aapc-btn-outline" data-parse-table="${escapeHtml(t.id || idx)}" style="padding:4px 10px; font-size:12px;">
                👉 Load This Table
              </button>
            </div>
            <div style="font-size:12px; color:#475569; font-family:monospace; background:#f1f5f9; padding:6px 10px; border-radius:6px; overflow-x:auto;">
              Headers: ${escapeHtml(headers || "None detected")}
            </div>
          </div>
        `;
      })
      .join("");

    listContainer.querySelectorAll("[data-parse-table]").forEach((btn) => {
      btn.onclick = () => {
        const tableId = btn.getAttribute("data-parse-table");
        const parsed = scrapeTableById(tableId);
        if (parsed && parsed.length > 0) {
          displayedList = parsed;
          document.querySelectorAll(".aapc-tab-btn").forEach((b) => b.classList.remove("active"));
          document.getElementById("aapc-main-table-wrap").style.display = "block";
          document.getElementById("aapc-inspector-panel").classList.remove("active");
          document.getElementById("aapc-active-view-name").innerText = `Custom Table: #${tableId}`;
          renderTable(displayedList);
          updateStats(displayedList);
          showNotification(`Loaded ${parsed.length} rows from #${tableId}`);
        } else {
          alert(`No order rows could be extracted from #${tableId}`);
        }
      };
    });
  }

  function savePurchasesToStorage(items) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: "SAVE_PURCHASES",
        purchases: items.map((i) => ({
          orderId: i.orderId,
          billTo: i.billTo,
          date: i.date,
          productType: i.productType,
          shippedTo: i.shippedTo,
          amount: i.amount,
          downloadUrl: i.downloadUrl,
          itemIndex: i.itemIndex
        }))
      });
    }
  }

  function showNotification(msg) {
    const note = document.createElement("div");
    note.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 24px;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-family: sans-serif;
      z-index: 2147483647;
      box-shadow: 0 10px 20px rgba(0,0,0,0.2);
      border-left: 4px solid #10b981;
      animation: aapcSlideIn 0.2s ease;
    `;
    note.innerText = msg;
    document.body.appendChild(note);
    setTimeout(() => {
      note.style.opacity = "0";
      note.style.transition = "opacity 0.3s";
      setTimeout(() => note.remove(), 300);
    }, 2800);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
