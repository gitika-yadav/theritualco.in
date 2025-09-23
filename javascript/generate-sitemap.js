const fs = require("fs");
const path = require("path");

const BASE_URL = "https://theritualco.in";
const OUTPUT_PATH = path.join(__dirname, "sitemap.xml");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith(".html")) {
      results.push(fullPath);
    }
  });
  return results;
}

const htmlFiles = walk(__dirname)
  .filter(p => !p.includes('partials') && !p.includes('node_modules') && !p.includes('netlify/functions'))
  .map((filePath) => {
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, "/");
    const cleanedPath = relativePath.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
    const urlPath = cleanedPath === "index.html" ? "" : cleanedPath;
    return `  <url>\n    <loc>${BASE_URL}/${urlPath}</loc>\n    <priority>${urlPath === "" ? "1.0" : "0.7"}</priority>\n  </url>`;
  });

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  htmlFiles.join("\n") +
  `\n</urlset>\n`;

fs.writeFileSync(OUTPUT_PATH, sitemap, "utf8");
console.log(`✅ Sitemap generated at: ${OUTPUT_PATH}`);
