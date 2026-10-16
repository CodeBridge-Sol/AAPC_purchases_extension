# AAPC Purchases Explorer & Downloader Web App

A powerful web application and browser extension built to run directly on the AAPC website ([purchaseditem.aspx](https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true)), automatically log in with member credentials, scrape all purchase records, and display an interactive management table with instant receipts/invoice download.

---

## 📋 Features

- **Direct In-Page Web App (Chrome Extension & Userscript)**:
  - Injects a floating modern Web App directly onto `https://www.aapc.com/*`.
  - **Azure AD B2C Auto-Login**: Pre-configured with member login `Cardeahealthcare` / `Walnut@143!`.
  - Scrapes ASP.NET GridView, Telerik RadGrid, and HTML tables across the purchases page.
  - Interactive table displaying:
    1. **Order Id** (with 1-click clipboard copy)
    2. **Bill To** (billing name & account)
    3. **Date** (purchase date)
    4. **Product Type** (e.g., CPC Exam Prep, National Membership, Code Books, CEU Webinars)
    5. **Shipped To** (shipping destination / delivery method)
    6. **Amount** (total amount in USD, with grand total calculated)
    7. **Download Action** (triggers original AAPC download or generates official purchase receipt)
  - **Export to CSV**: 1-click export of all scraped purchases into Excel-compatible CSV.
  - **Batch Download**: One-click download of all receipts sequentially.
  - **Live Search & Filter**: Real-time filtering across all table fields.

- **Standalone Web App (`standalone-app/`)**:
  - Independent Node.js web server (`server.js`) running at `http://localhost:3000`.
  - Beautiful web dashboard with zero external runtime dependencies.
  - API endpoints for `/api/purchases`, `/api/export-csv`, `/api/download/:orderId`, and Playwright automation.

---

## 🚀 Quick Start Guide

### Option 1: Chrome Extension (Recommended)

1. Open Google Chrome (or Microsoft Edge / Brave).
2. Go to `chrome://extensions` in the address bar.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** in the top-left corner.
5. Select the directory:
   ```
   /Users/manky/Documents/antigravity/resilient-newton/extension
   ```
6. Navigate to your AAPC URL:
   [https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true](https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true)
7. On the login page, click **Auto-Fill & Sign In** or let the assistant sign you in with `Cardeahealthcare`.
8. Once on the purchases page, click the floating **🛒 AAPC Purchases App** button at the bottom-right of your screen to open the Web App dashboard!

---

### Option 2: Tampermonkey / Userscript (1-Click Setup)

If you use Tampermonkey, Violentmonkey, or Greasemonkey:
1. Open Tampermonkey dashboard -> **Create a new script**.
2. Copy and paste the contents of:
   ```
   /Users/manky/Documents/antigravity/resilient-newton/userscript/aapc-purchases-app.user.js
   ```
3. Save the script (Ctrl+S or Cmd+S).
4. Visit `https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true`. The Web App will activate automatically!

---

### Option 3: Standalone Web App (Local Server)

To run the local web dashboard:
```bash
cd /Users/manky/Documents/antigravity/resilient-newton/standalone-app
node server.js
```
Open your browser and navigate to:
```
http://localhost:3000
```
- Click **Sample Data** to preview the full table and test CSV export / Receipt downloads immediately.
- Click **Fetch Live AAPC Purchases** to launch automated scraping.

---

## 📁 Repository Structure

```
.
├── README.md                           # Documentation and setup instructions
├── extension/                          # Chrome Extension (Manifest V3)
│   ├── manifest.json                   # Extension configuration
│   ├── background.js                   # Service worker for downloads & storage
│   ├── content.js                      # In-page Web App, auto-login, & DOM scraper
│   ├── content.css                     # Isolated UI styles for floating dashboard
│   ├── icons/                          # Generated extension icons (16, 48, 128 px)
│   └── popup/
│       ├── popup.html                  # Toolbar popup interface
│       ├── popup.js                    # Popup controller
│       └── popup.css                   # Popup styling
├── userscript/
│   └── aapc-purchases-app.user.js      # All-in-one Tampermonkey / Greasemonkey script
└── standalone-app/                     # Local Express / Node.js web server
    ├── server.js                       # Zero-dependency HTTP & API server
    ├── scraper.js                      # Playwright automated browser scraper
    ├── package.json                    # Node.js project definition
    └── public/
        ├── index.html                  # Web app dashboard UI
        ├── app.js                      # Frontend table logic & download handlers
        └── style.css                   # Modern responsive styling
```

---

## 🔒 Security & Privacy Notice
All credentials (`Cardeahealthcare` / `Walnut@143!`) and scraped purchase records remain strictly on your local browser/machine (`chrome.storage.local` / local server memory). No data is sent to third-party servers.
