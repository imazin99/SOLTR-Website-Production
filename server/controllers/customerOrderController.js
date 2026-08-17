const Customer = require('../models/Customer');
const Order = require('../models/Order');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/customers/me/orders
 *
 * New authenticated orders are linked by Order.customerId. Historical orders
 * created before customerId was introduced are read compatibly by their
 * immutable customer.email snapshot, but only when customerId is absent/null.
 * The authenticated customer identity always comes from the verified JWT.
 */
exports.getMyOrders = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId).select('_id email');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const ownershipFilters = [{ customerId: customer._id }];
    const email = String(customer.email || '').trim().toLowerCase();
    if (email) {
      ownershipFilters.push({
        $and: [
          { $or: [{ customerId: null }, { customerId: { $exists: false } }] },
          { 'customer.email': new RegExp(`^${escapeRegex(email)}$`, 'i') },
        ],
      });
    }

    const orders = await Order.find({ $or: ownershipFilters })
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error('[customerOrderController] Failed to fetch orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};
