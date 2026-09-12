// generate-products-feed.js — Google Merchant Center product feed
// Produces products-feed.xml from the Product JSON-LD on each product page.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const BASE_URL = "https://theritualco.in";
const ROOT = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(ROOT, "products");
const OUTPUT_PATH = path.join(ROOT, "products-feed.xml");

function availabilityMap(schema) {
  if (schema.includes("InStock")) return "in stock";
  if (schema.includes("PreOrder")) return "preorder";
  return "out of stock";
}

const items = [];

fs.readdirSync(PRODUCTS_DIR)
  .filter((f) => f.endsWith(".html"))
  .forEach((file) => {
    const html = fs.readFileSync(path.join(PRODUCTS_DIR, file), "utf8");
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    let product = null;
    scripts.forEach((s) => {
      try {
        const data = JSON.parse(s.textContent);
        if (data && data["@type"] === "Product") product = data;
      } catch (e) {}
    });
    if (!product) return;

    const slug = file.replace(/\.html$/, "");
    const url = `${BASE_URL}/products/${slug}`;
    const name = product.name || slug;
    const description = (product.description || "").slice(0, 2000);
    const image = product.image ? product.image[0] || product.image : "";
    const brand = (product.brand && product.brand.name) || "The Ritual Co.";
    const color = product.color || "Pastel";
    const googleCategory = "Sporting Goods > Exercise & Fitness Equipment";

    let offers = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
    if (product.offers && product.offers["@type"] === "AggregateOffer") {
      offers = product.offers.offers || [product.offers];
    }
    offers.forEach((offer) => {
      if (!offer.price) return;
      const sku = offer.sku || slug;
      let title = name;
      if (/1KG/.test(sku)) title = `${title} (1 kg)`;
      if (/2KG/.test(sku)) title = `${title} (2 kg)`;
      items.push(`  <item>
    <g:id>${sku}</g:id>
    <title>${title}</title>
    <link>${url}</link>
    <description>${description}</description>
    <image_link>${image}</image_link>
    <availability>${availabilityMap(offer.availability)}</availability>
    <price>${offer.price} INR</price>
    <brand>${brand}</brand>
    <condition>new</condition>
    <google_product_category>${googleCategory}</google_product_category>
    <product_type>${googleCategory}</product_type>
    <color>${color}</color>
    <custom_label_0>pilates</custom_label_0>
  </item>`);
    });
  });

const feed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>The Ritual Co. Products</title>
    <link>${BASE_URL}/products/products</link>
    <description>Aesthetic pilates, yoga and strength equipment for Indian homes</description>

${items.join("\n")}

  </channel>
</rss>`;

fs.writeFileSync(OUTPUT_PATH, feed, "utf8");
console.log(`✅ Merchant feed generated: ${OUTPUT_PATH} (${items.length} items)`);