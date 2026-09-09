// local-netlify-server.js
// Lightweight static server that mirrors theritualco.in's Netlify behavior:
//   - serves .html files at their extensionless clean URLs (like Netlify)
//   - mirrors the netlify.toml redirects:
//       /account  ->  /account/orders (301)
//       /*.html   ->  /:splat          (301)
//   - other assets (.css/.js/.webp/.png etc.) served from disk
//
// Usage:  node local-netlify-server.js [port]
// Default port: 8888 (matches netlify.toml dev targetPort)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

const PORT = parseInt(process.argv[2], 10) || 8888;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Map a request path to a file path (extensionless .html resolution).
function resolveFile(urlPath) {
  // Decode and strip query/hash
  let p = decodeURIComponent(urlPath);
  const q = p.indexOf("?");
  if (q !== -1) p = p.substring(0, q);

  if (p === "/") p = "/index.html";

  // Prevent path traversal
  const safe = path.normalize(p).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(ROOT, safe);

  // If no extension, try as <path>.html (Netlify-style extensionless serving)
  if (!path.extname(filePath)) {
    const withHtml = filePath + ".html";
    if (fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) {
      filePath = withHtml;
    }
  }

  return filePath;
}

// Map cart product ID -> inventory product ID (mirrors shared/product-map.js + cart.js)
function normalizeId(id, weight) {
  if (id === "capsule-dumbbell") {
    const w = String(weight || "").toLowerCase();
    return w.indexOf("2") === 0 ? "capsule-2kg" : "capsule-1kg";
  }
  return id;
}

// Local mock of /.netlify/functions/get-availability so the front-end stock
// cap (cart.js) can be tested without production data. Shape mirrors the real
// function: availability[product_id] = { in_stock, colors: { color: { stock, ... } } }
const MOCK_AVAILABILITY = {
  "capsule-1kg": {
    in_stock: true,
    colors: {
      cream: { in_stock: true, stock: 5, sold: 45, color: "Cream" },
      black: { in_stock: false, stock: 0, sold: 50, color: "Black" }
    }
  },
  "capsule-2kg": {
    in_stock: true,
    colors: {
      cream: { in_stock: true, stock: 8, sold: 20, color: "Cream" },
      black: { in_stock: true, stock: 3, sold: 25, color: "Black" }
    }
  },
  "yoga-belt":   { in_stock: true, colors: { default: { in_stock: true, stock: 200, sold: 10, color: "default" } } },
  "yoga-block":  { in_stock: true, colors: { black: { in_stock: true, stock: 50, sold: 5, color: "Black" } } },
  "yoga-mat-5mm":{ in_stock: true, colors: { default: { in_stock: true, stock: 20, sold: 3, color: "default" } } },
  "ankle-weights-2lb": { in_stock: true, colors: { default: { in_stock: true, stock: 12, sold: 2, color: "default" } } },
  "pilates-ball":{ in_stock: true, colors: { default: { in_stock: true, stock: 30, sold: 1, color: "default" } } }
};

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // --- mock /.netlify/functions/get-availability for local stock testing ---
  if (url === "/.netlify/functions/get-availability" || url.startsWith("/.netlify/functions/get-availability?")) {
    // Support ?product=<id> filter like the real function
    const q = url.indexOf("?") !== -1 ? url.substring(url.indexOf("?") + 1) : "";
    let data = MOCK_AVAILABILITY;
    const m = q.match(/[?&]?product=([^&]+)/);
    if (m) {
      const pid = decodeURIComponent(m[1]);
      data = MOCK_AVAILABILITY[pid] ? { [pid]: MOCK_AVAILABILITY[pid] } : {};
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
    return;
  }

  // --- mock /.netlify/functions/create-order — replicates the server-side stock
  //     guard (409 OUT_OF_STOCK) so local testing exercises the full flow. ---
  if (url === "/.netlify/functions/create-order" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        const items = data.cart || [];
        for (const item of items) {
          const invId = normalizeId(item.id, item.weight);
          const rec = MOCK_AVAILABILITY[invId];
          if (!rec) continue;
          const color = String(item.color || "default").toLowerCase().trim().replace(/\s+/g, "");
          const colorRec = rec.colors && rec.colors[color];
          const available = colorRec ? (Number(colorRec.stock) || 0) : (rec.in_stock ? Infinity : 0);
          const qty = Math.max(1, parseInt(item.qty, 10) || 1);
          if (Number.isFinite(available) && qty > available) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: "Only " + available + " unit" + (available === 1 ? "" : "s") + " of " + (item.name || item.id) + " (" + (item.color || "default") + ") left in stock. Please reduce the quantity and try again.",
              code: "OUT_OF_STOCK",
              available: available
            }));
            return;
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ order_id: "local-mock-" + Date.now(), amount: Math.round((data.payment_method === "cod" ? 200 : 0) * 100), currency: "INR", items: items }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad request" }));
      }
    });
    return;
  }

  // --- netlify.toml [[redirects]] ---
  // 1) /account -> /account/orders (301)
  if (url === "/account" || url.startsWith("/account?")) {
    res.writeHead(301, { Location: "/account/orders" });
    res.end();
    return;
  }
  // 2) /*.html -> /:splat (301)  e.g. /products/products.html -> /products/products
  const htmlMatch = url.match(/^(\/?[^?#]*)\.html([?#].*)?$/);
  if (htmlMatch) {
    const clean = htmlMatch[1] === "" ? "/" : htmlMatch[1] + (htmlMatch[2] || "");
    res.writeHead(301, { Location: clean });
    res.end();
    return;
  }

  // --- static serving ---
  let filePath = resolveFile(url);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 404 with a friendly note
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found — " + url);
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Netlify-mirror server running:");
  console.log("  → http://localhost:" + PORT + "/");
  console.log("  → http://localhost:" + PORT + "/products/products");
  console.log("  → http://localhost:" + PORT + "/about");
  console.log("");
});
