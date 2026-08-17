const express = require('express');
const router  = express.Router();

const { registerVisit, getVisitorCount } = require('../controllers/visitorController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Visitors API                                │
  │                                                     │
  │  POST /api/visitors/register   { visitorId }         │
  │  GET  /api/visitors/count      → { totalVisitors }   │
  └─────────────────────────────────────────────────────┘
*/

router.post('/register', registerVisit);
router.get('/count',     getVisitorCount);

module.exports = router;
