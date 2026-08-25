const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const products = require("../data/products.json");
const { formatAmount, generateSignature } = require("../lib/payfast");

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

// POST /api/create-checkout-session
// body: { items: [{ id: "amorato-single", qty: 2 }, ...] }
// Prices are always looked up server-side from products.json — the
// frontend's cart is display-only, never trusted for billing amounts.
//
// Unlike Stripe, PayFast doesn't hand back a ready-made checkout URL —
// it needs a signed form POSTed to it. So this endpoint builds a pending
// order, signs the PayFast fields, saves both, and returns a URL to our
// OWN small redirect page (below) that auto-submits that form. The
// frontend's contract (`{ url }`, then `window.location.href = url`)
// stays exactly the same either way.
router.post("/", (req, res) => {
  try {
    if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY) {
      return res.status(500).json({
        error: "PayFast is not configured yet. Add PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY to backend/.env"
      });
    }

    const { items, customer } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items in cart." });
    }
    if (!customer || !customer.firstName || !customer.email || !customer.address || !customer.address.line1) {
      return res.status(400).json({ error: "Missing customer or shipping details." });
    }

    let amountCents = 0;
    const lineItems = [];
    for (const item of items) {
      const product = products[item.id];
      const qty = Math.max(1, Math.min(100, parseInt(item.qty, 10) || 1));
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.id}` });
      }
      amountCents += product.unitAmount * qty;
      lineItems.push({ description: product.name, quantity: qty, amountTotal: product.unitAmount * qty });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5500";
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
    const orderId = crypto.randomUUID();

    // Keep item_name short — PayFast caps it — and put the itemised
    // breakdown in item_description instead.
    const itemName =
      lineItems.length === 1 ? lineItems[0].description.slice(0, 100) : `The House of Amorato — ${lineItems.length} items`;
    const itemDescription = lineItems
      .map((li) => `${li.quantity} x ${li.description}`)
      .join(", ")
      .slice(0, 255);

    // Field order matters for the signature — build it once, in order,
    // and reuse the exact same object every time this order is signed.
    // name_first/name_last/email_address are optional PayFast fields
    // that pre-fill the buyer's details on its payment page.
    const payfastFields = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: `${frontendUrl}/index.html?checkout=success`,
      cancel_url: `${frontendUrl}/index.html?checkout=cancelled`,
      notify_url: `${backendUrl}/api/payfast/notify`,
      name_first: customer.firstName,
      name_last: customer.lastName || "",
      email_address: customer.email,
      m_payment_id: orderId,
      amount: formatAmount(amountCents),
      item_name: itemName,
      item_description: itemDescription
    };
    const signature = generateSignature(payfastFields);

    // Log what's actually being sent (minus the merchant key) — if
    // PayFast rejects this, comparing against what shows here is the
    // fastest way to spot a mismatch.
    console.log("PayFast checkout built:", {
      mode: process.env.PAYFAST_MODE || "sandbox",
      merchant_id: payfastFields.merchant_id,
      return_url: payfastFields.return_url,
      cancel_url: payfastFields.cancel_url,
      notify_url: payfastFields.notify_url,
      amount: payfastFields.amount,
      item_name: payfastFields.item_name,
      signature
    });

    const order = {
      id: orderId,
      invoiceNumber: "INV-" + orderId.slice(0, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending", // pending -> paid -> processing -> shipped -> delivered
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
      customerEmail: customer.email,
      customerPhone: customer.phone || "",
      shippingAddress: {
        line1: customer.address.line1,
        line2: customer.address.line2 || "",
        city: customer.address.city,
        state: customer.address.province,
        postal_code: customer.address.postalCode,
        country: customer.address.country
      },
      amountTotal: amountCents,
      currency: "zar",
      items: lineItems,
      tracking: { carrier: null, number: null, url: null },
      payfast: { fields: payfastFields, signature }
    };

    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);

    res.json({ url: `${backendUrl}/api/checkout/payfast/${orderId}` });
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Could not start checkout." });
  }
});

// GET /api/checkout/payfast/:orderId — an auto-submitting form that
// hands the browser off to PayFast's hosted payment page. This exists
// because PayFast requires a POST of signed fields, not a plain link.
router.get("/payfast/:orderId", (req, res) => {
  const orders = readOrders();
  const order = orders.find((o) => o.id === req.params.orderId);
  if (!order || !order.payfast) {
    return res.status(404).send("Order not found.");
  }

  const { processUrl } = require("../lib/payfast");
  const inputs = Object.entries(order.payfast.fields)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`)
    .join("\n");

  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting to PayFast…</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;">
  <p>Redirecting you to PayFast to complete your payment…</p>
  <form id="pf-form" action="${processUrl()}" method="post">
    ${inputs}
    <input type="hidden" name="signature" value="${order.payfast.signature}">
    <noscript><button type="submit">Continue to PayFast</button></noscript>
  </form>
  <script>document.getElementById('pf-form').submit();</script>
</body></html>`);
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = router;
