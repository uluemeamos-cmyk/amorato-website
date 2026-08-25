const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAdmin = require("../lib/adminAuth");
const { buildTrackingUrl, carriers } = require("../lib/trackingCarriers");
const { sendMail } = require("../lib/mailer");

const router = express.Router();
const ordersFile = path.join(__dirname, "..", "data", "orders.json");

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch {
    return [];
  }
}
function writeOrders(orders) {
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}

router.use(requireAdmin);

// GET /api/orders — list all orders, newest first
router.get("/", (req, res) => {
  const orders = readOrders().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(orders);
});

// GET /api/orders/carriers — the supported courier list, for the admin UI
router.get("/carriers", (req, res) => {
  res.json(carriers);
});

// GET /api/orders/:id
router.get("/:id", (req, res) => {
  const order = readOrders().find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

// PATCH /api/orders/:id
// body: { status?, trackingCarrier?, trackingNumber?, trackingUrlManual?, notifyCustomer? }
router.patch("/:id", async (req, res) => {
  const orders = readOrders();
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });

  const order = orders[idx];
  const { status, trackingCarrier, trackingNumber, trackingUrlManual, notifyCustomer } = req.body || {};

  if (status) order.status = status;
  if (trackingCarrier !== undefined) order.tracking.carrier = trackingCarrier;
  if (trackingNumber !== undefined) order.tracking.number = trackingNumber;
  order.tracking.url = buildTrackingUrl(order.tracking.carrier, order.tracking.number, trackingUrlManual);
  order.updatedAt = new Date().toISOString();

  orders[idx] = order;
  writeOrders(orders);

  let emailSent = false;
  if (notifyCustomer && order.customerEmail) {
    const trackingLine = order.tracking.url
      ? `Track your order here: ${order.tracking.url}`
      : order.tracking.number
      ? `Tracking number: ${order.tracking.number}`
      : "";
    emailSent = await sendMail({
      to: order.customerEmail,
      subject: `Your Amorato order is on its way — ${order.invoiceNumber}`,
      text: `Hi ${order.customerName || "there"},\n\nYour order ${order.invoiceNumber} is on its way.\n${trackingLine}\n\nUnity. Love. Strength.\nThe House of Amorato`
    });
  }

  res.json({ order, emailSent });
});

module.exports = router;
