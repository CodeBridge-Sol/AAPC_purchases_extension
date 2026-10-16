// AAPC Purchases Explorer - Popup Script

document.addEventListener("DOMContentLoaded", async () => {
  const btnOpen = document.getElementById("btn-open-aapc");
  const btnExport = document.getElementById("btn-popup-export-csv");
  const countEl = document.getElementById("cache-count");
  const timeEl = document.getElementById("cache-time");

  // Load cached data from chrome.storage
  try {
    const data = await chrome.storage.local.get(["last_scraped_purchases", "last_scraped_time"]);
    const purchases = data.last_scraped_purchases || [];
    countEl.innerText = purchases.length;
    if (data.last_scraped_time) {
      const dt = new Date(data.last_scraped_time);
      timeEl.innerText = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  } catch (e) {
    console.error("Failed to load cached purchases:", e);
  }

  // Open AAPC Tab
  btnOpen.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "OPEN_PURCHASES_TAB" });
    window.close();
  });

  // Export CSV from popup
  btnExport.addEventListener("click", async () => {
    const data = await chrome.storage.local.get("last_scraped_purchases");
    const purchases = data.last_scraped_purchases || [];

    if (purchases.length === 0) {
      alert("No purchases stored yet. Open AAPC and scan orders first.");
      return;
    }

    const headers = ["Order Id", "Bill To", "Date", "Product Type", "Shipped To", "Amount", "Download URL"];
    const rows = purchases.map((p) => [
      `"${(p.orderId || "").replace(/"/g, '""')}"`,
      `"${(p.billTo || "").replace(/"/g, '""')}"`,
      `"${(p.date || "").replace(/"/g, '""')}"`,
      `"${(p.productType || "").replace(/"/g, '""')}"`,
      `"${(p.shippedTo || "").replace(/"/g, '""')}"`,
      `"${(p.amount || "").replace(/"/g, '""')}"`,
      `"${(p.downloadUrl || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AAPC_Purchases_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
