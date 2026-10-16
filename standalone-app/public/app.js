// AAPC Purchases Dashboard - Frontend Logic

let allPurchases = [];

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
});

async function initDashboard() {
  await loadPurchases();

  // Search input
  const searchInput = document.getElementById("input-search");
  searchInput.addEventListener("input", (e) => {
    filterPurchases(e.target.value);
  });

  // Modal actions
  const btnOpenModal = document.getElementById("btn-open-fetch-modal");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCancelModal = document.getElementById("btn-cancel-modal");
  const fetchModal = document.getElementById("fetch-modal");
  const btnRunScrape = document.getElementById("btn-run-scrape");
  const btnLoadSample = document.getElementById("btn-load-sample");
  const btnDownloadAll = document.getElementById("btn-download-all");

  btnOpenModal.onclick = () => fetchModal.classList.add("active");
  btnCloseModal.onclick = () => fetchModal.classList.remove("active");
  btnCancelModal.onclick = () => fetchModal.classList.remove("active");

  btnLoadSample.onclick = async () => {
    try {
      const res = await fetch("/api/load-sample", { method: "POST" });
      const data = await res.json();
      allPurchases = data.data || [];
      renderTable(allPurchases);
      updateStats(allPurchases);
    } catch (e) {
      alert("Failed to load sample data: " + e.message);
    }
  };

  btnDownloadAll.onclick = () => {
    if (allPurchases.length === 0) {
      alert("No purchases available to download.");
      return;
    }
    allPurchases.forEach((p, idx) => {
      setTimeout(() => {
        window.open(`/api/download/${encodeURIComponent(p.orderId)}`, "_blank");
      }, idx * 300);
    });
  };

  btnRunScrape.onclick = async () => {
    const username = document.getElementById("modal-username").value;
    const password = document.getElementById("modal-password").value;
    const headless = document.getElementById("modal-headless").value === "true";

    const progressBox = document.getElementById("fetch-progress");
    const statusText = document.getElementById("fetch-status-text");

    progressBox.style.display = "flex";
    btnRunScrape.disabled = true;
    statusText.innerText = "Launching browser & navigating to AAPC SSO...";

    try {
      const res = await fetch("/api/fetch-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          headless,
          url: document.getElementById("modal-target-url") ? document.getElementById("modal-target-url").value : ""
        })
      });

      const result = await res.json();
      if (result.success && result.purchases && result.purchases.length > 0) {
        allPurchases = result.purchases;
        renderTable(allPurchases);
        updateStats(allPurchases);
        fetchModal.classList.remove("active");
        alert(`Successfully fetched ${result.purchases.length} purchases from AAPC!`);
      } else {
        alert(
          result.error ||
          "Scraper finished but found 0 purchase records on the page. Try visual mode to observe the login flow."
        );
      }
    } catch (err) {
      alert("Error initiating AAPC fetch: " + err.message);
    } finally {
      progressBox.style.display = "none";
      btnRunScrape.disabled = false;
    }
  };
}

async function loadPurchases() {
  try {
    const res = await fetch("/api/purchases");
    const json = await res.json();
    allPurchases = json.data || [];
    renderTable(allPurchases);
    updateStats(allPurchases);
  } catch (err) {
    console.error("Error loading purchases:", err);
  }
}

function renderTable(items) {
  const tbody = document.getElementById("purchases-table-body");
  const showingText = document.getElementById("showing-text");

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px; color: #64748b;">
          <h3>No Purchases Found</h3>
          <p>Click "Fetch Live AAPC Purchases" or "Sample Data" to load records.</p>
        </td>
      </tr>
    `;
    showingText.innerText = `Showing 0 of ${allPurchases.length} purchases`;
    return;
  }

  tbody.innerHTML = items
    .map((item, idx) => {
      const badgeClass = getProductClass(item.productType);
      return `
        <tr>
          <td>
            <span class="order-id-code">
              ${escapeHtml(item.orderId)}
              <button class="btn-copy" data-order="${escapeHtml(item.orderId)}" title="Copy Order ID">📋</button>
            </span>
          </td>
          <td><strong>${escapeHtml(item.billTo)}</strong></td>
          <td>${escapeHtml(item.date)}</td>
          <td><span class="badge-prod-type ${badgeClass}">${escapeHtml(item.productType)}</span></td>
          <td><span style="display:inline-flex;align-items:center;gap:4px;">📍 <strong>${escapeHtml(item.shippedTo)}</strong></span></td>
          <td><strong style="color:#0f172a;">${escapeHtml(item.amount)}</strong></td>
          <td style="text-align: center;">
            <a href="/api/download/${encodeURIComponent(item.orderId)}" target="_blank" class="btn-sm-download">
              ⬇️ Download
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  showingText.innerText = `Showing ${items.length} of ${allPurchases.length} purchases`;

  // Attach copy listeners
  tbody.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.onclick = () => {
      const text = btn.getAttribute("data-order");
      navigator.clipboard.writeText(text);
      btn.innerText = "✓";
      setTimeout(() => (btn.innerText = "📋"), 1500);
    };
  });
}

function filterPurchases(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    renderTable(allPurchases);
    return;
  }

  const filtered = allPurchases.filter((p) => {
    return (
      (p.orderId && p.orderId.toLowerCase().includes(q)) ||
      (p.billTo && p.billTo.toLowerCase().includes(q)) ||
      (p.date && p.date.toLowerCase().includes(q)) ||
      (p.productType && p.productType.toLowerCase().includes(q)) ||
      (p.shippedTo && p.shippedTo.toLowerCase().includes(q)) ||
      (p.amount && p.amount.toLowerCase().includes(q))
    );
  });

  renderTable(filtered);
}

function updateStats(items) {
  document.getElementById("stat-total-orders").innerText = items.length;

  let total = 0;
  items.forEach((item) => {
    const num = parseFloat((item.amount || "").replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) total += num;
  });

  document.getElementById("stat-total-spend").innerText =
    "$" + total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getProductClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("exam") || t.includes("cpc")) return "exam";
  if (t.includes("course") || t.includes("training") || t.includes("webinar") || t.includes("ceu")) return "course";
  if (t.includes("digital") || t.includes("code") || t.includes("renewal")) return "digital";
  if (t.includes("membership")) return "membership";
  return "";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
