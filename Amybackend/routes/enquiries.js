const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAdmin = require("../lib/adminAuth");

const router = express.Router();
const enquiriesFile = path.join(__dirname, "..", "data", "enquiries.json");

router.use(requireAdmin);

// GET /api/enquiries — every contact/newsletter/girl-child-form submission,
// newest first. This is the only way to see them if SMTP isn't (or
// wasn't yet) configured — nothing submitted here is ever lost.
router.get("/", (req, res) => {
  let enquiries = [];
  try {
    enquiries = JSON.parse(fs.readFileSync(enquiriesFile, "utf8"));
  } catch {
    enquiries = [];
  }
  enquiries.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  res.json(enquiries);
});

module.exports = router;
