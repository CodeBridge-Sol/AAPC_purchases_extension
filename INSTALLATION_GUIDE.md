# 📦 AAPC Purchases Explorer — Installation & Sharing Guide

This guide explains how to install and use the **AAPC Purchases Explorer & Downloader** on Google Chrome, Microsoft Edge, Brave, or any Chromium browser.

---

## ⚡ Method 1: Install via Extension ZIP (Recommended for Team Sharing)

### Step 1: Extract the Extension
1. Download `aapc-purchases-extension.zip`.
2. Extract / Unzip the file into a permanent folder on your computer (e.g. `Documents/aapc-extension` or `Desktop/aapc-extension`).
   > *Note: Keep this folder where it won't be deleted, as Chrome runs the extension directly from it.*

### Step 2: Load into Chrome
1. Open Google Chrome and go to:
   ```text
   chrome://extensions
   ```
   *(On Edge, go to `edge://extensions`; on Brave, `brave://extensions`)*
2. In the top-right corner, turn **ON** the **Developer mode** toggle.
3. In the top-left corner, click the **Load unpacked** button.
4. Select the unzipped `extension` folder (the folder containing `manifest.json`).
5. **Done!** You will see **AAPC Purchases Explorer & Downloader** appear in your extension list.

### Step 3: Pin & Use on AAPC
1. Click the puzzle icon (🧩) in your Chrome toolbar and click the pin icon (📌) next to **AAPC Purchases Explorer**.
2. Visit AAPC:
   - [AAPC My Purchased Items](https://www.aapc.com/memberarea/my-purchased-items.aspx)
   - Or any AAPC Order Receipt page (`purchaseditem.aspx?i=...`)
3. A floating **🛒 AAPC Purchases App** button will appear in the bottom-right corner. Click it to launch the explorer table!

---

## 🛠️ Method 2: Tampermonkey Userscript (Zero Developer Mode)

If you already use Tampermonkey or Violentmonkey:
1. Open the Tampermonkey Dashboard.
2. Click **+** (Create a new script).
3. Copy the contents of `userscript/aapc-purchases-app.user.js` and paste it into the editor.
4. Press `Ctrl+S` (or `Cmd+S` on Mac) to save.
5. Visit AAPC — the app will activate automatically!

---

## 🚀 Key Features for Users

| Feature | How to Use |
| :--- | :--- |
| **Year Filter** | Click any year pill (e.g. `📅 2024 (41)`) to view purchases for that year. |
| **⚡ Expand [Year] Students** | Click the orange button to automatically fetch all receipts and unpack student names (`For / Shipped To`) for that specific year. |
| **Real-Time Live Streaming** | As each order is fetched, student rows appear on screen row-by-row in real time. |
| **⏹️ Stop Button** | Click **Stop** in the top progress banner anytime to pause or cancel. |
| **🗂️ Group by Year** | Check the **Group by Year** box to view categorized sections with spend totals. |
| **🔍 Search** | Search by Student Name, Order ID, Date, Amount, or Product. |
| **📥 Export to CSV** | Exports all filtered and unpacked student items into an Excel-ready CSV. |
