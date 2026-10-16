const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// In-memory purchases store
let purchasesDb = [
  // Order #103815086 (Matches user AAPC screenshot media_1792150414413.png)
  {
    orderId: "103815086",
    billTo: "A Azhar",
    date: "8/8/2022",
    productType: "New Membership - Student (AAPC)",
    shippedTo: "Fathima N S",
    amount: "$125.00",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
  },
  {
    orderId: "103815086",
    billTo: "A Azhar",
    date: "8/8/2022",
    productType: "New Membership - Student (AAPC)",
    shippedTo: "Sillaa PS",
    amount: "$125.00",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
  },
  {
    orderId: "103815086",
    billTo: "A Azhar",
    date: "8/8/2022",
    productType: "Equalization Levy",
    shippedTo: "Cardea Healthcare Solutions",
    amount: "$7.65",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
  },
  {
    orderId: "103815086",
    billTo: "A Azhar",
    date: "8/8/2022",
    productType: "New Membership - Student (AAPC)",
    shippedTo: "Bismi Nazar S",
    amount: "$125.00",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
  },
  // Order #103815087
  {
    orderId: "103815087",
    billTo: "Cardea Healthcare",
    date: "9/15/2022",
    productType: "Certified Professional Coder (CPC) Exam Voucher",
    shippedTo: "Ayesha Siddiqua (Candidate #E88291)",
    amount: "$399.00",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true"
  },
  {
    orderId: "103815087",
    billTo: "Cardea Healthcare",
    date: "9/15/2022",
    productType: "CPT 2023 Professional Edition Book",
    shippedTo: "Mohammed Zameer (16/1 Cambridge Rd)",
    amount: "$139.95",
    downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true"
  }
];

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API Routes
  if (pathname === "/api/purchases" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, total: purchasesDb.length, data: purchasesDb }));
    return;
  }

  if (pathname === "/api/load-sample" && req.method === "POST") {
    purchasesDb = [
      // Order #103815086 (Matches user AAPC screenshot media_1792150414413.png)
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Fathima N S",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Sillaa PS",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "Equalization Levy",
        shippedTo: "Cardea Healthcare Solutions",
        amount: "$7.65",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
      },
      {
        orderId: "103815086",
        billTo: "A Azhar",
        date: "8/8/2022",
        productType: "New Membership - Student (AAPC)",
        shippedTo: "Bismi Nazar S",
        amount: "$125.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=74baec09-b31a-42b7-9a92-213f6d0740ed&dcsc=true"
      },
      // Order #103815087
      {
        orderId: "103815087",
        billTo: "Cardea Healthcare",
        date: "9/15/2022",
        productType: "Certified Professional Coder (CPC) Exam Voucher",
        shippedTo: "Ayesha Siddiqua (Candidate #E88291)",
        amount: "$399.00",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true"
      },
      {
        orderId: "103815087",
        billTo: "Cardea Healthcare",
        date: "9/15/2022",
        productType: "CPT 2023 Professional Edition Book",
        shippedTo: "Mohammed Zameer (16/1 Cambridge Rd)",
        amount: "$139.95",
        downloadUrl: "https://www.aapc.com/memberarea/purchaseditem.aspx?i=103815087&dcsc=true"
      }
    ];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, count: purchasesDb.length, data: purchasesDb }));
    return;
  }

  if (pathname === "/api/export-csv" && req.method === "GET") {
    const headers = ["Order Id", "Bill To", "Date", "Product Type", "Shipped To", "Amount", "Download URL"];
    const rows = purchasesDb.map((p) => [
      `"${(p.orderId || "").replace(/"/g, '""')}"`,
      `"${(p.billTo || "").replace(/"/g, '""')}"`,
      `"${(p.date || "").replace(/"/g, '""')}"`,
      `"${(p.productType || "").replace(/"/g, '""')}"`,
      `"${(p.shippedTo || "").replace(/"/g, '""')}"`,
      `"${(p.amount || "").replace(/"/g, '""')}"`,
      `"${(p.downloadUrl || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="AAPC_Purchases_${Date.now()}.csv"`
    });
    res.end(csv);
    return;
  }

  if (pathname.startsWith("/api/download/") && req.method === "GET") {
    const orderId = decodeURIComponent(pathname.replace("/api/download/", ""));
    const order = purchasesDb.find((p) => p.orderId.toLowerCase() === orderId.toLowerCase());
    const item = order || {
      orderId: orderId,
      billTo: "Cardea Healthcare",
      date: new Date().toLocaleDateString(),
      productType: "AAPC Product / Purchase Item",
      shippedTo: "Cardea Healthcare",
      amount: "$0.00"
    };

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AAPC Purchase Receipt - ${item.orderId}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; max-width: 720px; margin: auto; }
          .header { border-bottom: 2px solid #0056b3; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-size: 26px; font-weight: 800; color: #0056b3; letter-spacing: 0.5px; }
          .receipt-title { font-size: 16px; font-weight: 700; color: #475569; }
          .meta-box { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          .table th { background: #f1f5f9; padding: 12px 16px; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 13px; font-weight: 700; color: #334155; }
          .table td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
          .total-box { margin-top: 24px; text-align: right; font-size: 20px; font-weight: 800; color: #0f172a; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">AAPC</div>
          <div class="receipt-title">Official Purchase Receipt</div>
        </div>

        <div class="meta-box">
          <div><strong>Order ID:</strong> ${item.orderId}</div>
          <div><strong>Order Date:</strong> ${item.date}</div>
          <div><strong>Billed To:</strong> ${item.billTo}</div>
          <div><strong>Shipped To:</strong> ${item.shippedTo}</div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Product / Item Description</th>
              <th>Type</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${item.productType}</strong></td>
              <td>Electronic / Member Area</td>
              <td style="text-align: right; font-weight: bold;">${item.amount}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          Total Paid: <span style="color: #059669;">${item.amount}</span>
        </div>

        <div class="footer">
          <p>American Academy of Professional Coders (AAPC)</p>
          <p>URL: https://www.aapc.com/memberarea/purchaseditem.aspx</p>
        </div>
      </body>
      </html>
    `;

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="AAPC_Receipt_${item.orderId}.html"`
    });
    res.end(receiptHtml);
    return;
  }

  if (pathname === "/api/fetch-live" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        // Check if playwright is available
        let scraper;
        try {
          scraper = require("./scraper");
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              error:
                "Playwright module is not installed in standalone environment. Use the Chrome Extension / Userscript directly on AAPC website, or run 'npm install playwright' to enable local automated browser scraping."
            })
          );
          return;
        }

        const result = await scraper.scrapeAAPCPurchases({
          credentials: {
            username: payload.username || "Cardeahealthcare",
            password: payload.password || "Walnut@143!"
          },
          url: payload.url || "https://www.aapc.com/memberarea/my-purchased-items.aspx",
          headless: payload.headless !== undefined ? payload.headless : true
        });

        if (result.success && result.purchases.length > 0) {
          purchasesDb = result.purchases;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error: " + err.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 AAPC Purchases Web App running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
