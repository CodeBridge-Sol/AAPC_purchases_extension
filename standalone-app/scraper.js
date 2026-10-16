// AAPC Purchases Automated Scraper using Playwright
// Enhanced for my-purchased-items.aspx (#gvReceipts & #gvItems)

const { chromium } = require("playwright");

const DEFAULT_CREDENTIALS = {
  username: process.env.AAPC_USERNAME || "Cardeahealthcare",
  password: process.env.AAPC_PASSWORD || "Walnut@143!"
};

const DEFAULT_URL =
  process.env.AAPC_URL ||
  "https://www.aapc.com/memberarea/my-purchased-items.aspx";

async function scrapeAAPCPurchases(options = {}) {
  const credentials = options.credentials || DEFAULT_CREDENTIALS;
  const targetUrl = options.url || DEFAULT_URL;
  const headless = options.headless !== undefined ? options.headless : true;

  console.log(`[Playwright Scraper] Launching browser (headless: ${headless})...`);
  const browser = await chromium.launch({
    headless: headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    console.log(`[Playwright Scraper] Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Handle Azure AD B2C / AAPC login if redirected
    const currentUrl = page.url();
    console.log(`[Playwright Scraper] Current page URL: ${currentUrl}`);

    if (
      currentUrl.includes("b2clogin.com") ||
      currentUrl.includes("loginazure.aspx") ||
      currentUrl.includes("/sso-landing/") ||
      (await page.$('input[type="password"]')) !== null
    ) {
      console.log("[Playwright Scraper] Login page detected. Performing authentication...");

      const userInputSelector = '#signInName, #logonIdentifier, input[name="Email Address"], input[type="email"], input[type="text"]';
      await page.waitForSelector(userInputSelector, { timeout: 15000 });
      await page.fill(userInputSelector, credentials.username);

      const passInputSelector = '#password, input[type="password"]';
      await page.waitForSelector(passInputSelector, { timeout: 15000 });
      await page.fill(passInputSelector, credentials.password);

      console.log("[Playwright Scraper] Credentials entered. Submitting login form...");
      const submitSelector = '#next, button[type="submit"], input[type="submit"], .buttons #next';
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}),
        page.click(submitSelector)
      ]);

      console.log(`[Playwright Scraper] Post-login URL: ${page.url()}`);
    }

    // Ensure we are on my-purchased-items.aspx or target URL
    if (!page.url().includes("my-purchased-items.aspx") && !page.url().includes("purchaseditem.aspx")) {
      console.log(`[Playwright Scraper] Navigating to target purchases page...`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    await page.waitForTimeout(3000);

    // Unhide hidden rows in tablesorter on AAPC
    await page.evaluate(() => {
      document.querySelectorAll("#gvReceipts tbody tr, #gvItems tbody tr").forEach((r) => {
        r.classList.add("active");
        r.style.display = "";
      });
      if (typeof window.loadMoreTableRows === "function") {
        try {
          window.loadMoreTableRows("gvReceipts");
          window.loadMoreTableRows("gvItems");
        } catch (e) {}
      }
    });

    console.log("[Playwright Scraper] Extracting purchase rows...");
    const purchases = await page.evaluate(() => {
      const results = [];

      function extractDateString(text) {
        if (!text || typeof text !== "string") return "";
        const labelMatch = text.match(/(?:Invoice\s*Date|Order\s*Date|Receipt\s*Date|Transaction\s*Date|Purchase\s*Date|Date)\s*:?\s*([A-Za-z0-9\s,\/\-\.]+)/i);
        if (labelMatch && labelMatch[1]) {
          const sub = extractDateString(labelMatch[1].trim());
          if (sub) return sub;
        }
        const monthNameMatch = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/i);
        if (monthNameMatch) return monthNameMatch[0].trim();
        const dayMonthMatch = text.match(/\b\d{1,2}(?:st|nd|rd|th)?[\s\-\/](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:[\s\-\/]\d{2,4})?\b/i);
        if (dayMonthMatch) return dayMonthMatch[0].trim();
        const numMatch = text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/);
        if (numMatch) return numMatch[0].trim();
        const isoMatch = text.match(/\b(19\d{2}|20\d{2})[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/);
        if (isoMatch) return isoMatch[0].trim();
        return "";
      }

      function extractYear(dateStr) {
        if (!dateStr || typeof dateStr !== "string" || dateStr === "N/A") return "Unknown";
        const y4 = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
        if (y4) return y4[1];
        const y2 = dateStr.match(/[\/\-\.](\d{2})\b/);
        if (y2) {
          const yr = parseInt(y2[1], 10);
          return yr >= 50 ? `19${yr}` : `20${yr}`;
        }
        return "Unknown";
      }

      // Target gvReceipts and gvItems specifically, then fallback
      const targetTableIds = ["gvReceipts", "gvItems", "gvVouchers"];
      let tablesToScan = [];

      targetTableIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) tablesToScan.push(el);
      });

      if (tablesToScan.length === 0) {
        tablesToScan = Array.from(document.querySelectorAll("table"));
      }

      tablesToScan.forEach((table) => {
        const tId = table.id || "table";
        const rows = Array.from(table.querySelectorAll("tbody tr, tr"));
        if (rows.length < 2) return;

        const ths = Array.from(table.querySelectorAll("th, thead td, tr:first-child th, tr:first-child td")).map((th) => th.innerText.trim().toLowerCase());
        const shipColIdx = ths.findIndex((h) => h.includes("for / shipped to") || h.includes("shipped to") || h.includes("shipped"));
        const prodColIdx = ths.findIndex((h) => h.includes("product") || h.includes("item") || h.includes("desc"));
        const totalColIdx = ths.findIndex((h) => h === "total" || h.includes("total"));
        const priceColIdx = ths.findIndex((h) => h.includes("price") || h.includes("amount"));

        rows.forEach((r, rIdx) => {
          if (rIdx === 0 && r.querySelector("th") && !r.querySelector("td")) return;
          const cells = Array.from(r.querySelectorAll("td"));
          if (cells.length < 2) return;

          const text = r.innerText.trim();
          if (/^(?:subtotal|tax|shipping|grand total|total\s*:)/i.test(text) && cells.length <= 3) return;

          const amountMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
          const parsedDate = extractDateString(text) || "N/A";
          const parsedYear = extractYear(parsedDate);
          const guidMatch = text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);

          let orderId = guidMatch ? guidMatch[0] : (cells[0] ? cells[0].innerText.trim() : `ORD-${1000 + results.length}`);
          const link = r.querySelector("a[href*='i='], a[href*='receipt'], a[href*='download']");
          if (link && link.href) {
            const m = link.href.match(/i=([a-f0-9\-]+)/i);
            if (m) orderId = m[1];
          }

          let prodType = "AAPC Purchase Receipt";
          if (prodColIdx !== -1 && cells[prodColIdx]) {
            prodType = cells[prodColIdx].innerText.trim();
          } else if (tId === "gvItems") {
            prodType = cells[0] ? cells[0].innerText.trim() : "AAPC Course / Exam Item";
          } else if (cells.length >= 3 && !cells[1].innerText.includes("$") && !cells[1].innerText.match(/\d\/\d/)) {
            prodType = cells[1].innerText.trim();
          }

          let shippedTo = "Cardea Healthcare";
          if (shipColIdx !== -1 && cells[shipColIdx]) {
            shippedTo = cells[shipColIdx].innerText.trim();
          }

          let itemAmount = "$0.00";
          if (totalColIdx !== -1 && cells[totalColIdx]) {
            const m = cells[totalColIdx].innerText.match(/\$[\d,]+(?:\.\d{2})?/);
            if (m) itemAmount = m[0];
          } else if (priceColIdx !== -1 && cells[priceColIdx]) {
            const m = cells[priceColIdx].innerText.match(/\$[\d,]+(?:\.\d{2})?/);
            if (m) itemAmount = m[0];
          } else if (amountMatch) {
            itemAmount = amountMatch[0];
          }

          results.push({
            orderId: orderId,
            billTo: "Cardea Healthcare",
            date: parsedDate,
            year: parsedYear,
            productType: prodType,
            shippedTo: shippedTo,
            amount: itemAmount,
            downloadUrl: link ? link.href : ""
          });
        });
      });

      return results;
    });

    console.log(`[Playwright Scraper] Scraped ${purchases.length} purchase records.`);
    return {
      success: true,
      purchases: purchases,
      count: purchases.length,
      pageUrl: page.url()
    };
  } catch (error) {
    console.error("[Playwright Scraper] Error during scraping:", error);
    return {
      success: false,
      error: error.message,
      purchases: []
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeAAPCPurchases };
