const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const BASE_URL = "https://theritualco.in";
const BLOG_DIR = path.join(__dirname, "category"); // update if your path differs

function walk(dir) {
  let files = [];
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(walk(fullPath));
    } else if (file.endsWith(".html")) {
      files.push(fullPath);
    }
  });
  return files;
}

const blogFiles = walk(BLOG_DIR).filter(f => f.includes("/bloglist/"));

blogFiles.forEach(file => {
  const html = fs.readFileSync(file, "utf8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title = doc.querySelector("title")?.textContent || "Untitled";
  const description = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
  const image = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
  const date = doc.querySelector("meta[property='article:published_time']")?.getAttribute("content") || new Date().toISOString();
  const filePath = file.replace(__dirname, "").replace(/\\/g, "/");
  const url = `${BASE_URL}${filePath}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "image": image,
    "author": { "@type": "Person", "name": "Gitika Yadav" },
    "publisher": {
      "@type": "Organization",
      "name": "The Ritual Co",
      "logo": {
        "@type": "ImageObject",
        "url": `${BASE_URL}/images/logo.png`
      }
    },
    "datePublished": date,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url
    }
  };

  const jsonScript = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;

  const headTag = html.includes("</head>") ? "</head>" : null;

  if (headTag) {
    const updatedHTML = html.replace(headTag, `${jsonScript}\n${headTag}`);
    fs.writeFileSync(file, updatedHTML, "utf8");
    console.log("✅ Injected JSON-LD into:", filePath);
  }
});
