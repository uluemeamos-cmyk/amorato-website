const express = require("express");
const products = require("../data/products.json");

const router = express.Router();

// GET /api/products — full catalog, for a future admin UI or storefront sync
router.get("/", (req, res) => {
  res.json(products);
});

module.exports = router;
