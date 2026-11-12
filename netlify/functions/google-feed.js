// netlify/functions/google-feed.js
// Google Merchant Center product feed (RSS 2.0 + g: namespace) for free listings
// ("Popular products" / Shopping tab). Served at https://theritualco.in/google-feed.xml
// and /products-feed.xml (see netlify.toml). Merchant Center fetches it on a schedule.
//
// Same catalogue + live stock as the Meta feed (shared/catalog.js).

const { SITE, BRAND, ITEMS, loadAvailability } = require('./shared/catalog');

// Pre-order items must carry an availability_date for Google.
// Matches "Pre-order · Ships in December" on the site — update when the shipment date is known.
const PREORDER_SHIP_DATE = '2026-12-15T00:00:00+05:30';

// Google product taxonomy (text form) per product group
const GOOGLE_CATEGORY = {
    'yoga-mat-5mm': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates > Yoga & Pilates Mats',
    'yoga-block': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates > Yoga & Pilates Blocks',
    'yoga-belt': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates',
    'pilates-ball': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates',
    'pilates-ring': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates',
    'capsule-dumbbell': 'Sporting Goods > Exercise & Fitness > Weight Lifting > Free Weights',
    'ankle-weights-2lb': 'Sporting Goods > Exercise & Fitness > Weight Lifting > Free Weights',
    'grip-socks': 'Apparel & Accessories > Clothing > Socks',
    'grip-socks-trio': 'Apparel & Accessories > Clothing > Socks',
};
const DEFAULT_CATEGORY = 'Sporting Goods > Exercise & Fitness > Yoga & Pilates';

// Searchable product_type path (your own taxonomy — helps Google match queries)
const PRODUCT_TYPE = {
    'yoga-mat-5mm': 'Yoga > Yoga Mats',
    'yoga-block': 'Yoga > Yoga Blocks',
    'yoga-belt': 'Yoga > Yoga Straps',
    'pilates-ball': 'Pilates > Pilates Balls',
    'pilates-ring': 'Pilates > Pilates Rings',
    'capsule-dumbbell': 'Pilates > Light Dumbbells',
    'ankle-weights-2lb': 'Pilates > Ankle Weights',
    'grip-socks': 'Pilates > Grip Socks',
    'grip-socks-trio': 'Pilates > Grip Socks',
    'pilates-starter-kit': 'Kits > Pilates Kits',
    'pilates-sculpt-kit': 'Kits > Pilates Kits',
    'pilates-complete-kit': 'Kits > Pilates Kits',
    'yoga-essentials-kit': 'Kits > Yoga Kits',
    'yoga-studio-kit': 'Kits > Yoga Kits',
};

function xml(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function tag(name, value) {
    if (value === '' || value == null) return '';
    return `      <g:${name}>${xml(value)}</g:${name}>\n`;
}

exports.handler = async () => {
    const availabilityFor = await loadAvailability('google-feed');

    const items = ITEMS.map(item => {
        const availability = availabilityFor(item).replace(/ /g, '_'); // in_stock / out_of_stock / preorder
        const isKit = item.group.endsWith('-kit');
        // Kits sell at a single retail price; the pieces-bought-separately total is not a former price,
        // so don't send it as a crossed-out price to Google.
        const price = isKit && item.salePrice ? item.salePrice : item.price;
        const salePrice = !isKit && item.salePrice ? item.salePrice : null;

        return '    <item>\n' +
            tag('id', item.id) +
            tag('title', item.title) +
            tag('description', item.desc) +
            tag('link', SITE + item.path) +
            tag('image_link', `${SITE}/images/catalog/${item.img}.jpg`) +
            tag('availability', availability) +
            (availability === 'preorder' ? tag('availability_date', PREORDER_SHIP_DATE) : '') +
            tag('price', `${price.toFixed(2)} INR`) +
            (salePrice ? tag('sale_price', `${salePrice.toFixed(2)} INR`) : '') +
            tag('brand', BRAND) +
            tag('condition', 'new') +
            tag('identifier_exists', 'no') +
            tag('mpn', item.id) +
            tag('item_group_id', item.group) +
            tag('color', item.color) +
            tag('size', item.size) +
            tag('google_product_category', GOOGLE_CATEGORY[item.group] || DEFAULT_CATEGORY) +
            tag('product_type', PRODUCT_TYPE[item.group] || '') +
            tag('gender', 'female') +
            tag('age_group', 'adult') +
            tag('custom_label_0', isKit ? 'kit' : 'single') +
            // Free shipping on every order, across India
            '      <g:shipping>\n' +
            '        <g:country>IN</g:country>\n' +
            '        <g:price>0.00 INR</g:price>\n' +
            '      </g:shipping>\n' +
            '    </item>';
    });

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>The Ritual Co.</title>
    <link>${SITE}/</link>
    <description>Aesthetic Pilates and yoga kits and equipment for home, made for India</description>
${items.join('\n')}
  </channel>
</rss>
`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=900'
        },
        body
    };
};
