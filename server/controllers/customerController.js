const Order = require('../models/Order');

/**
 * Shared aggregation pipeline: groups every Order by customer.phone
 * (always required, unlike email) and rolls up the stats the
 * Customers dashboard page needs.
 */
function buildCustomerAggregation(extraStages = []) {
  return [
    {
      $group: {
        _id:         '$customer.phone',
        name:        { $last: '$customer.name' },
        email:       { $last: '$customer.email' },
        phone:       { $last: '$customer.phone' },
        totalOrders: { $sum: 1 },
        totalSpent:  { $sum: '$total' },
        joinedAt:    { $min: '$createdAt' },
      },
    },
    {
      $project: {
        _id: 0,
        id: '$_id',   // stable identifier for GET /api/customers/:id — the customer's phone number
        name: 1, email: 1, phone: 1, totalOrders: 1, totalSpent: 1, joinedAt: 1,
      },
    },
    ...extraStages,
  ];
}

/* ═══════════════════════════════════════════════════
   GET /api/customers
   Every distinct customer (grouped by phone), derived
   live from Order data. Supports:
     ?search=ahmed   (matches name, email, or phone)
     ?sort=newest|oldest  (by joinedAt — default newest)
═══════════════════════════════════════════════════ */
exports.getCustomers = async (req, res) => {
  try {
    const { search, sort = 'newest' } = req.query;

    const extraStages = [];
    if (search && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re   = new RegExp(safe, 'i');
      extraStages.push({
        $match: { $or: [{ name: re }, { email: re }, { phone: re }] },
      });
    }
    extraStages.push({ $sort: { joinedAt: sort === 'oldest' ? 1 : -1 } });

    const customers = await Order.aggregate(buildCustomerAggregation(extraStages));
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch customers', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/customers/:id
   :id is the customer's phone number (their one guaranteed-present,
   stable identifier — see Customer.js for why there's no ObjectId).
═══════════════════════════════════════════════════ */
exports.getCustomer = async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.id);
    const extraStages = [{ $match: { phone } }];

    const [customer] = await Order.aggregate(buildCustomerAggregation(extraStages));
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch customer', error: err.message });
  }
};
