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

const { createClient } = require('@supabase/supabase-js');

const SITE = 'https://theritualco.in';
const BRAND = 'The Ritual Co.';
const CATEGORY = 'Sporting Goods > Exercise & Fitness';

// availability rule per item: 'stock' = use Supabase stock, or a fixed value
const ITEMS = [
    // ── The Ritual Socks ──
    ...[['Cream', 'SCK-CRM-STD'], ['Pink', 'SCK-PNK-STD'], ['Coffee', 'SCK-LCF-STD']].map(([color, sku]) => ({
        id: sku, group: 'grip-socks', title: `The Ritual Socks – ${color} (1 pair)`, color, size: 'Free size',
        price: 699, path: '/products/the-ritual-socks', img: sku, avail: 'stock',
        desc: 'Non-slip grip socks for pilates, barre and yoga. Soft cotton blend with silicone heart grips. Free shipping across India.'
    })),
    {
        id: 'SCK-TRIO', group: 'grip-socks-trio', title: 'The Ritual Socks – The Trio (Cream, Pink & Coffee)', color: 'Cream/Pink/Coffee', size: 'Free size',
        price: 1499, salePrice: null, path: '/products/the-ritual-socks', img: 'SCK-TRIO',
        avail: 'stock', stockSkus: ['SCK-CRM-STD', 'SCK-PNK-STD', 'SCK-LCF-STD'],
        desc: 'Three pairs of non-slip grip socks, one in each shade: Cream, Pink and Coffee. Silicone heart grips for pilates, barre and yoga. Free shipping across India.'
    },

    // ── Capsule Dumbbells (preorder) ──
    ...['1kg', '2kg'].flatMap(w => [['Black', 'BLK'], ['Coffee', 'LCF'], ['Cream', 'CRM'], ['Pink', 'PNK']].map(([color, c]) => ({
        id: `DMB-${c}-${w.toUpperCase()}`, group: 'capsule-dumbbell', title: `Capsule Silicone Dumbbells ${w} pair – ${color}`, color, size: w,
        price: w === '1kg' ? 2499 : 2999, path: '/products/capsule-dumbbell', img: `DMB-${c}`, avail: 'preorder',
        desc: 'Soft-touch, skin-safe silicone capsule dumbbells with a cast-iron core and ergonomic ~35 mm grip. Sold as a pair.'
    }))),

    // ── The Ritual Cuffs ──
    ...[['Black', 'AKW-BLK-2LB'], ['Coffee', 'AKW-LCF-2LB'], ['Cream', 'AKW-CRM-2LB'], ['Pink', 'AKW-PNK-2LB']].map(([color, sku]) => ({
        id: sku, group: 'ankle-weights-2lb', title: `The Ritual Cuffs Ankle Weights – ${color}`, color, size: '2lb each',
        price: 3499, path: '/products/the-ritual-cuffs', img: sku, avail: 'stock',
        desc: 'Baby-soft silicone ankle weights for pilates, barre and low-impact training. Adjustable, waterproof, 2lb per cuff, sold as a pair.'
    })),

    // ── The Ritual Ball ──
    ...[['Black', 'BAL-BLK-STD'], ['Coffee', 'BAL-LCF-STD'], ['Cream', 'BAL-CRM-STD'], ['Pink', 'BAL-PNK-STD']].map(([color, sku]) => ({
        id: sku, group: 'pilates-ball', title: `The Ritual Ball Mini Pilates Ball – ${color}`, color, size: '25 cm',
        price: 999, path: '/products/the-ritual-ball', img: sku, avail: 'stock',
        desc: 'Mini pilates ball for core, inner thigh and pelvic floor work. Anti-burst, skin-safe PVC, 25 cm.'
    })),

    // ── The Ritual Belt ──
    ...[['Black', 'BLT-BLK-8FT'], ['Coffee', 'BLT-LCF-8FT'], ['Cream', 'BLT-CRM-8FT']].map(([color, sku]) => ({
        id: sku, group: 'yoga-belt', title: `The Ritual Belt Cotton Yoga Strap – ${color}`, color, size: '96 in',
        price: 499, path: '/products/the-ritual-belt', img: sku, avail: 'stock',
        desc: 'Organic cotton yoga strap with an adjustable metal D-ring buckle. Stretch deeper and improve alignment.'
    })),

    // ── The Ritual Mat ──
    ...[['Black', 'MAT-BLK-STD'], ['Coffee', 'MAT-LCF-STD'], ['Cream', 'MAT-CRM-STD'], ['Pink', 'MAT-PNK-STD']].map(([color, sku]) => ({
        id: sku, group: 'yoga-mat-5mm', title: `The Ritual Mat Natural Rubber Yoga Mat – ${color}`, color, size: '183 x 61 cm, 5 mm',
        price: 4999, path: '/products/the-ritual-mat', img: sku, avail: 'stock',
        desc: 'Natural rubber yoga mat with sweat-resistant grip. 5 mm thick, non-slip base, 183 x 61 cm.'
    })),

    // ── The Ritual Block ──
    ...[['Black', 'BLK-BLK-STD'], ['Pink', 'BLK-PNK-STD']].map(([color, sku]) => ({
        id: sku, group: 'yoga-block', title: `The Ritual Block EVA Foam Yoga Block – ${color}`, color, size: 'Standard',
        price: 899, path: '/products/the-ritual-block', img: sku, avail: 'stock',
        desc: 'Dense EVA foam yoga block for alignment, seated poses and deeper stretches. Skin-safe and stable.'
    })),

    // ── The Ritual Ring (waitlist) ──
    {
        id: 'RNG-STD', group: 'pilates-ring', title: 'The Ritual Ring Pilates Circle', color: '', size: '14 in',
        price: 1499, path: '/products/the-ritual-ring', img: 'RNG-STD', avail: 'out of stock',
        desc: 'Pilates ring (magic circle) for inner thigh, arm and core toning. Dual foam-padded handles, 14 inch.'
    },

    // ── Kits (preorder) ──
    { id: 'KIT-PILATES-STARTER', group: 'pilates-starter-kit', title: 'Pilates Starter Kit – Mat, Ring, Ball & Dumbbells', price: 9996, path: '/products/pilates-starter-kit', img: 'KIT-PILATES-STARTER', avail: 'preorder',
      desc: 'The Ritual Mat, Ring, Ball and 1kg Capsule Dumbbells. Everything to start pilates at home. Preorder now.' },
    { id: 'KIT-PILATES-SCULPT', group: 'pilates-sculpt-kit', title: 'Pilates Sculpt Kit – Ring, Ball, Dumbbells & Cuffs', price: 8496, path: '/products/pilates-sculpt-kit', img: 'KIT-PILATES-SCULPT', avail: 'preorder',
      desc: 'For the mat you already own: The Ritual Ring, Ball, 1kg Capsule Dumbbells and Cuffs ankle weights. Preorder now.' },
    { id: 'KIT-PILATES-COMPLETE', group: 'pilates-complete-kit', title: 'Pilates Complete Kit – All Six Pieces', price: 14394, path: '/products/pilates-complete-kit', img: 'KIT-PILATES-COMPLETE', avail: 'preorder',
      desc: 'Mat, ring, ball, 1kg dumbbells, cuffs and a block: the complete home pilates set. Preorder now.' },
    { id: 'KIT-YOGA-ESSENTIALS', group: 'yoga-essentials-kit', title: 'Yoga Essentials Kit – Mat, Belt & Block', price: 6397, path: '/products/yoga-essentials-kit', img: 'KIT-YOGA-ESSENTIALS', avail: 'preorder',
      desc: 'The Ritual Mat, Belt and Block bundled together for a complete home yoga practice. Preorder now.' },
    { id: 'KIT-YOGA-STUDIO', group: 'yoga-studio-kit', title: 'Yoga Studio Kit – Belt & Two Blocks', price: 2297, path: '/products/yoga-studio-kit', img: 'KIT-YOGA-STUDIO', avail: 'preorder',
      desc: 'For the mat you already own: The Ritual Belt and two Ritual Blocks. Preorder now.' },
];

const COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link',
    'brand', 'item_group_id', 'color', 'size', 'google_product_category', 'gender', 'age_group'];

function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

exports.handler = async () => {
    // Live stock by SKU (fall back to "in stock" for stock-tracked items if the DB is unreachable)
    let stock = null;
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data, error } = await db.from('inventory').select('sku, stock, active');
        if (error) throw error;
        stock = {};
        (data || []).forEach(r => { stock[r.sku] = r.active === false ? 0 : (r.stock || 0); });
    } catch (err) {
        console.error('[meta-catalog] inventory fetch failed:', err.message || err);
    }

    const availabilityFor = (item) => {
        if (item.avail !== 'stock') return item.avail;
        if (!stock) return 'in stock';
        const skus = item.stockSkus || [item.id];
        return skus.every(s => (stock[s] || 0) > 0) ? 'in stock' : 'out of stock';
    };

    const rows = ITEMS.map(item => ({
        id: item.id,
        title: item.title,
        description: item.desc,
        availability: availabilityFor(item),
        condition: 'new',
        price: `${item.price.toFixed(2)} INR`,
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
