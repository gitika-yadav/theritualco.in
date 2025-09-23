// generate-feed.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const BASE_URL = "https://theritualco.in";
const BLOG_DIR = path.join(__dirname, "category"); // blog folders are inside /category
const OUTPUT_PATH = path.join(__dirname, "feed.xml");

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

function parseBlogMetadata(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title = doc.querySelector("title")?.textContent || "Untitled";
  const metaDesc = doc.querySelector('meta[name="description"]')?.content || "";
  const relativePath = path.relative(__dirname, filePath).replace(/\\/g, "/");
  const url = `${BASE_URL}/${relativePath}`;

  // Look for a publish comment: <!-- published: 2025-06-05T10:00:00Z -->
  const match = html.match(/<!--\s*published:\s*(.*?)\s*-->/);
  const pubDate = match ? new Date(match[1]).toUTCString() : new Date().toUTCString();

  return { title, url, description: metaDesc, pubDate };
}

const blogFiles = walk(BLOG_DIR);

const itemsXml = blogFiles.map(file => {
  const { title, url, description, pubDate } = parseBlogMetadata(file);
  return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
}).join("\n");

const feedXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>The Ritual Co. Blog</title>
    <link>${BASE_URL}/blog.html</link>
    <description>Rituals for movement, strength, and wellness</description>
    <language>en-us</language>

${itemsXml}

  </channel>
</rss>`;

fs.writeFileSync(OUTPUT_PATH, feedXml, "utf8");
console.log(`✅ RSS feed generated at: ${OUTPUT_PATH}`);
