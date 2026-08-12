const Customer = require('../models/Customer');
const Order    = require('../models/Order');

/**
 * SOLTR — server/controllers/customerOrderController.js
 *
 * IMPORTANT — read before changing the matching logic below:
 * Order.customer has no `customerId` reference back to a real
 * Customer account — checkout has always been anonymous (no login
 * required to place an order), and Phase 5 was scoped to NOT modify
 * checkout.html/checkout.js. So there is no foreign key to join on.
 *
 * Instead, a customer's orders are matched by comparing the
 * customer's account email against Order.customer.email
 * (case-insensitive — Customer.email is schema-lowercased,
 * Order.customer.email is not). This works correctly whenever a
 * customer checks out using the same email as their account.
 *
 * Known, honest limitation: an order placed as a guest with a
 * DIFFERENT email than the one later used to register an account
 * will never appear here — there is no way to link them without
 * either (a) adding a real customerId to Order (requires touching
 * checkout.js, out of scope for this phase) or (b) asking the
 * customer to confirm old guest orders some other way. Flagging this
 * rather than silently pretending the match is exhaustive.
 */

/* ═══════════════════════════════════════════════════
   GET /api/customers/me/orders
   Protected (requireCustomerAuth). Returns every order whose
   customer.email matches the logged-in customer's account email,
   newest first. Full order documents — no separate "detail" endpoint
   needed, since orders are small and this data is already complete.
═══════════════════════════════════════════════════ */
exports.getMyOrders = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (!customer.email) {
      return res.json([]); // no email on the account — cannot match anything, return empty rather than error
    }

    const safeEmail = customer.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const orders = await Order.find({
      'customer.email': new RegExp(`^${safeEmail}$`, 'i'),
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
};
