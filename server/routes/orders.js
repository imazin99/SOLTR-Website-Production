const express = require('express');
const router  = express.Router();
const requireAuth = require('../middleware/auth');
const { orderCreationIp } = require('../middleware/rateLimits');
const optionalCustomerAuth = require('../middleware/optionalCustomerAuth');

const {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  updateStatus,
  deleteOrder,
} = require('../controllers/orderController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Orders API                                 │
  │                                                     │
  │  GET    /api/orders              list + filter      │
  │  GET    /api/orders/:id          single order       │
  │  POST   /api/orders              create order       │
  │  PUT    /api/orders/:id          full update        │
  │  PUT    /api/orders/:id/status   status only        │
  │  DELETE /api/orders/:id          delete             │
  └─────────────────────────────────────────────────────┘
*/

router.get('/',              requireAuth, getOrders);
router.get('/:id',           requireAuth, getOrder);
router.post('/',             orderCreationIp, optionalCustomerAuth, createOrder);
router.put('/:id/status',    requireAuth, updateStatus);   /* must be before /:id */
router.put('/:id',           requireAuth, updateOrder);
router.delete('/:id',        requireAuth, deleteOrder);

module.exports = router;
