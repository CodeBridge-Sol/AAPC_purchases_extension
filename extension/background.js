// AAPC Purchases Explorer - Background Service Worker (Manifest V3)

const AAPC_PURCHASES_URL = "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true";

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[AAPC Background] Extension installed/updated:", details.reason);
  // Initialize default configuration
  const existing = await chrome.storage.local.get(["aapc_username", "aapc_password", "auto_login"]);
  if (!existing.aapc_username) {
    await chrome.storage.local.set({
      aapc_username: "Cardeahealthcare",
      aapc_password: "Walnut@143!",
      auto_login: true,
      target_url: AAPC_PURCHASES_URL
    });
  }
});

// Handle incoming messages from content scripts & popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === "DOWNLOAD_FILE") {
        const { url, filename } = message;
        if (!url) {
          sendResponse({ success: false, error: "Missing download URL" });
          return;
        }

        const downloadId = await chrome.downloads.download({
          url: url,
          filename: filename || "AAPC_Receipt.pdf",
          saveAs: false
        });

        sendResponse({ success: true, downloadId });
      } else if (message.action === "OPEN_PURCHASES_TAB") {
        const tab = await chrome.tabs.create({ url: AAPC_PURCHASES_URL });
        sendResponse({ success: true, tabId: tab.id });
      } else if (message.action === "SAVE_PURCHASES") {
        await chrome.storage.local.set({
          last_scraped_purchases: message.purchases || [],
          last_scraped_time: new Date().toISOString()
        });
        sendResponse({ success: true });
      } else if (message.action === "GET_PURCHASES") {
        const data = await chrome.storage.local.get(["last_scraped_purchases", "last_scraped_time"]);
        sendResponse({
          success: true,
          purchases: data.last_scraped_purchases || [],
          lastScrapedTime: data.last_scraped_time || null
        });
      } else if (message.action === "FETCH_URL") {
        const { url } = message;
        if (!url) {
          sendResponse({ success: false, error: "Missing URL to fetch" });
          return;
        }

        try {
          console.log("[AAPC Background] Proxying fetch for:", url);
          const res = await fetch(url, {
            method: "GET",
            credentials: "include",
            headers: {
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          });

          if (!res.ok) {
            sendResponse({ success: false, status: res.status, error: `HTTP ${res.status}` });
            return;
          }

          const html = await res.text();
          sendResponse({ success: true, html });
        } catch (fetchErr) {
          console.error("[AAPC Background] Fetch error for URL:", url, fetchErr);
          sendResponse({ success: false, error: fetchErr.message });
        }
      } else {
        sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (err) {
      console.error("[AAPC Background] Error processing message:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep channel open for async response
});
