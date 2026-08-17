const express = require('express');
const router  = express.Router();
const { visitorIp } = require('../middleware/rateLimits');

const { registerVisit, getVisitorCount } = require('../controllers/visitorController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Visitors API                                │
  │                                                     │
  │  POST /api/visitors/register   { visitorId }         │
  │  GET  /api/visitors/count      → { totalVisitors }   │
  └─────────────────────────────────────────────────────┘
*/

router.post('/register', visitorIp, registerVisit);
router.get('/count',     visitorIp, getVisitorCount);

module.exports = router;
