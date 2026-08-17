const express = require('express');
const router  = express.Router();

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

router.get('/',              getOrders);
router.get('/:id',           getOrder);
router.post('/',             createOrder);
router.put('/:id/status',    updateStatus);   /* must be before /:id */
router.put('/:id',           updateOrder);
router.delete('/:id',        deleteOrder);

module.exports = router;
