require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const checkoutRoute = require("./routes/checkout");
const payfastNotifyRoute = require("./routes/payfastNotify");
const contactRoute = require("./routes/contact");
const productsRoute = require("./routes/products");
const videosRoute = require("./routes/videos");
const ordersRoute = require("./routes/orders");
const invoiceRoute = require("./routes/invoice");

const app = express();

const extraOrigins = (process.env.EXTRA_ALLOWED_ORIGINS || "") .split(",") .map((o) => o.trim()) .filter(Boolean); app.use( cors({ origin(origin, callback) { const isLocal = !origin || origin === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); const isAllowed = isLocal || origin === process.env.FRONTEND_URL || extraOrigins.includes(origin); callback(null, isAllowed); } }) );
const extraOrigins = (process.env.EXTRA_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      const isLocal = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isAllowed = isLocal || origin === process.env.FRONTEND_URL || extraOrigins.includes(origin);
      callback(null, isAllowed);
    }
  })
);

// PayFast's ITN parses its own urlencoded body (see routes/payfastNotify.js),
// so it's mounted before the global express.json() below.
app.use("/api/payfast/notify", payfastNotifyRoute);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("The House of Amorato API is running.");
});

app.use("/api/create-checkout-session", checkoutRoute); // POST / — start a PayFast payment
app.use("/api/checkout", checkoutRoute); // GET /payfast/:orderId — the auto-submit redirect page
app.use("/api/contact", contactRoute);
app.use("/api/products", productsRoute);
app.use("/api/videos", videosRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/orders", invoiceRoute); // adds GET /api/orders/:id/invoice

// Simple admin dashboard — order list, tracking, invoices.
// Not linked from the public site; reachable directly at /admin.
app.use("/admin", express.static(path.join(__dirname, "admin")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`House of Amorato API listening on http://localhost:${PORT}`);
  console.log(`Admin dashboard at http://localhost:${PORT}/admin`);
});
