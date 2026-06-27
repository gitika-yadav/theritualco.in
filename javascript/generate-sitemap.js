const fs = require("fs");
const path = require("path");

const BASE_URL = "https://theritualco.in";

// Project root is one level up from /javascript/
const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "sitemap.xml");

// Folders/files to exclude from the sitemap (non-indexable pages)
const EXCLUDE_DIRS = ["partials", "node_modules", "netlify", "javascript", "css", "images", "admin", "account", ".git", ".idea"];
const EXCLUDE_FILES = [
    "checkout.html",
    "thank-you.html",
    "cart.html",
    "404.html",
    "login.html",
    "signup.html",
];

// Priority rules — first match wins
function priorityFor(urlPath) {
    if (urlPath === "") return "1.0";                       // homepage
    if (/^products\/(capsule-dumbbell|yoga-belt)$/.test(urlPath)) return "0.9"; // live products
    if (/^products\/(yoga-mat|ankle-weights)$/.test(urlPath)) return "0.6";     // coming soon
    if (urlPath === "products/products") return "0.9";      // collection
    if (/^(founder|press)$/.test(urlPath)) return "0.7";
    if (/^(about|faq|contact)$/.test(urlPath)) return "0.6";
    if (urlPath === "blog") return "0.7";
    if (urlPath.startsWith("blog/")) return urlPath.includes("bloglist") ? "0.5" : "0.6";
    if (/(privacy|terms|shipping|refund)/.test(urlPath)) return "0.3";
    return "0.6";
}

function walk(dir) {
    let results = [];
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (EXCLUDE_DIRS.includes(file)) continue;
            results = results.concat(walk(fullPath));
        } else if (file.endsWith(".html") && !EXCLUDE_FILES.includes(file)) {
            results.push(fullPath);
        }
    }
    return results;
}

const today = new Date().toISOString().slice(0, 10);

const urls = walk(ROOT)
    .map((filePath) => {
        const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
        // index.html -> "", everything else -> drop the .html extension for clean URLs
        let urlPath = rel === "index.html" ? "" : rel.replace(/\.html$/, "");
        // a folder's own index (e.g. blog/index.html) -> the folder path
        urlPath = urlPath.replace(/\/index$/, "");
        return { urlPath, priority: priorityFor(urlPath) };
    })
    // de-duplicate identical URLs (safety)
    .filter((v, i, arr) => arr.findIndex(x => x.urlPath === v.urlPath) === i)
    // stable sort: homepage first, then by priority desc, then alpha
    .sort((a, b) => (b.priority - a.priority) || a.urlPath.localeCompare(b.urlPath))
    .map(({ urlPath, priority }) =>
        `  <url>\n    <loc>${BASE_URL}/${urlPath}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`
    );

const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
    `        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;

fs.writeFileSync(OUTPUT_PATH, sitemap, "utf8");
console.log(`✅ Sitemap generated: ${OUTPUT_PATH} (${urls.length} URLs)`);