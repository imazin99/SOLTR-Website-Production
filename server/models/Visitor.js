const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Visitor.js
 *
 * One document per UNIQUE visitor. Uniqueness is enforced by the
 * `unique: true` index on visitorId, not by application logic — so a
 * duplicate registerVisit() call (e.g. same browser refreshing the page)
 * can never create a second document, no matter how it's called.
 *
 * visitorId is a random ID generated client-side (script.js) and
 * persisted in the browser's localStorage, so the same browser always
 * sends the same visitorId on every future visit. This is anonymous —
 * no personal data, no cookies, no IP address — just a random token
 * used purely to count "how many distinct browsers have visited".
 *
 * Total unique visitors = Visitor.countDocuments().
 */
const visitorSchema = new mongoose.Schema(
  {
    visitorId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visitor', visitorSchema);
