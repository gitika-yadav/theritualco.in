// netlify/functions/meta-catalog.js
// Product feed (CSV) for the Meta / Facebook / Instagram catalog.
// Served at https://theritualco.in/meta-catalog.csv (see netlify.toml).
// Meta Commerce Manager fetches it on a schedule, so prices and stock stay in sync.
//
// Names, prices, links and images below mirror the live product pages.
// Stock comes live from the Supabase `inventory` table (by SKU).
// Kits and dumbbells are always listed as preorder; the ring as out of stock (waitlist).
//
// item_group_id = the product id the website's Meta Pixel sends (Cart item id), so
// pixel events (content_type 'product_group') match catalog products.

const { SITE, BRAND, CATEGORY, ITEMS, loadAvailability } = require('./shared/catalog');

const COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link',
    'brand', 'item_group_id', 'color', 'size', 'google_product_category', 'gender', 'age_group'];

function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

exports.handler = async () => {
    const availabilityFor = await loadAvailability('meta-catalog');

    const rows = ITEMS.map(item => ({
        id: item.id,
        title: item.title,
        description: item.desc,
        availability: availabilityFor(item),
        condition: 'new',
        price: `${item.price.toFixed(2)} INR`,
        sale_price: item.salePrice ? `${item.salePrice.toFixed(2)} INR` : '',
        link: SITE + item.path,
        image_link: `${SITE}/images/catalog/${item.img}.jpg`,
        brand: BRAND,
        item_group_id: item.group,
        color: item.color || '',
        size: item.size || '',
        google_product_category: CATEGORY,
        gender: 'female',
        age_group: 'adult'
    }));

    const csv = [COLUMNS.join(',')]
        .concat(rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(',')))
        .join('\n') + '\n';

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': 'public, max-age=900'
        },
        body: csv
    };
};
