const Order   = require('../models/Order');
const Visitor = require('../models/Visitor');

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Midnight (local time) for a given Date, used to bucket orders by calendar day. */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/analytics
 *
 * Every number here is computed directly from the Order collection —
 * nothing is hardcoded. Two metrics (conversionRate, cartAbandonment)
 * are returned as explicit placeholders: SOLTR has no page-view/session
 * tracking, so there is no real data to compute them from.
 *
 * Scope notes (documented here since the dashboard doesn't show the
 * methodology):
 *  - totalRevenue / avgOrderValue: all-time, all orders (matches the
 *    Home page's revenue definition — same single source of truth).
 *  - revenueLast7Days / ordersPerDay: last 7 calendar days (matches the
 *    "Last 7 days" scope already labeled on the Analytics page).
 *  - bestSellingProducts / bestSellingSizes / salesByColor: all-time,
 *    so a young store with a quiet week still gets a meaningful chart.
 */
exports.getAnalytics = async (req, res) => {
  try {
    const orders = await Order.find({});

    /* ── Total Revenue + Average Order Value (all-time) ── */
    const totalOrders  = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgOrderValue = totalOrders > 0
      ? Math.round((totalRevenue / totalOrders) * 100) / 100
      : 0;

    /* ── Last 7 calendar days: buckets for revenue + order count ── */
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const revenueLast7Days = days.map(d => ({ day: DAY_LABELS[d.getDay()], val: 0 }));
    const ordersPerDay     = days.map(d => ({ day: DAY_LABELS[d.getDay()], val: 0 }));

    for (const order of orders) {
      const orderDay = startOfDay(order.createdAt).getTime();
      const idx = days.findIndex(d => d.getTime() === orderDay);
      if (idx !== -1) {
        revenueLast7Days[idx].val += (order.total || 0);
        ordersPerDay[idx].val     += 1;
      }
    }

    /* ── Best Selling Products / Sizes / Colors (all-time, from order items) ── */
    const productTotals = new Map(); // name -> { unitsSold, revenue }
    const sizeTotals    = new Map(); // size -> unitsSold
    const colorTotals   = new Map(); // color -> unitsSold
    let totalUnitsSold  = 0;

    for (const order of orders) {
      for (const item of order.items || []) {
        const qty = item.quantity || 0;
        totalUnitsSold += qty;

        const p = productTotals.get(item.name) || { name: item.name, unitsSold: 0, revenue: 0 };
        p.unitsSold += qty;
        p.revenue   += (item.price || 0) * qty;
        productTotals.set(item.name, p);

        if (item.size)  sizeTotals.set(item.size,  (sizeTotals.get(item.size)  || 0) + qty);
        if (item.color) colorTotals.set(item.color, (colorTotals.get(item.color) || 0) + qty);
      }
    }

    const bestSellingProducts = [...productTotals.values()]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    const toPct = (map) => [...map.entries()]
      .map(([key, units]) => ({ key, units, pct: totalUnitsSold > 0 ? Math.round((units / totalUnitsSold) * 100) : 0 }))
      .sort((a, b) => b.units - a.units);

    const bestSellingSizes = toPct(sizeTotals).map(({ key, pct }) => ({ size: key, pct }));
    const salesByColor     = toPct(colorTotals).map(({ key, pct }) => ({ color: key, pct }));

    /* ── Repeat Customers: % of distinct customers (by phone) with >1 order ── */
    const ordersByPhone = new Map();
    for (const order of orders) {
      const phone = order.customer?.phone;
      if (!phone) continue;
      ordersByPhone.set(phone, (ordersByPhone.get(phone) || 0) + 1);
    }
    const totalCustomers  = ordersByPhone.size;
    const repeatCount      = [...ordersByPhone.values()].filter(n => n > 1).length;
    const repeatPercentage = totalCustomers > 0 ? Math.round((repeatCount / totalCustomers) * 100) : 0;

    /* ── Website Visitors: real unique-visitor count from the Visitor collection ── */
    const websiteVisitors = await Visitor.countDocuments();

    res.json({
      totalRevenue,
      avgOrderValue,
      totalOrders,
      revenueLast7Days,
      ordersPerDay,
      bestSellingProducts,
      bestSellingSizes,
      salesByColor,
      websiteVisitors,
      repeatCustomers: {
        count: repeatCount,
        totalCustomers,
        percentage: repeatPercentage,
      },
      /* Placeholder — SOLTR has no page-view/session tracking to compute this from */
      conversionRate: {
        value: null,
        note: 'Requires site-traffic tracking, which is not implemented',
      },
      /* Placeholder — backend structure prepared in server/models/CartSession.js,
         but no checkout flow writes to it yet. Shown as "Coming Soon" on the
         dashboard rather than a fabricated percentage. */
      cartAbandonment: {
        value: null,
        note: 'Coming Soon',
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute analytics', error: err.message });
  }
};
