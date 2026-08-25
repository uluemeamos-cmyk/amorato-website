const express = require("express");
const dns = require("dns").promises;
const fs = require("fs");
const path = require("path");
const { validateUrl, generateSignature } = require("../lib/payfast");

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

// Best-effort confirmation the request actually came from PayFast: reverse
// resolve the source IP, and check the hostname is a payfast.co.za one.
// This is defense-in-depth, not the primary check — the signature +
// validate-URL round-trip below are what actually prove authenticity.
// Set PAYFAST_STRICT_IP_CHECK=true once you've confirmed this works
// reliably from your host, to hard-reject on failure instead of just
// logging a warning.
async function looksLikePayfastIp(ip) {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames.some((h) => h.endsWith(".payfast.co.za") || h === "payfast.co.za");
  } catch {
    return false;
  }
}

// POST /api/payfast/notify — PayFast's server-to-server payment
// confirmation ("ITN"). Never trust this data on signature/validate
// checks alone being skipped — all of the checks below are required by
// PayFast's own integration guidelines.
router.post("/", express.urlencoded({ extended: false }), async (req, res) => {
  // Always acknowledge quickly so PayFast doesn't retry unnecessarily —
  // we just won't mark the order paid unless every check below passes.
  res.status(200).send("OK");

  try {
    const body = { ...req.body };
    const receivedSignature = body.signature;
    delete body.signature;

    // 1. Signature check — recompute over the fields in the order they
    // arrived (Node's urlencoded parser preserves that order).
    const expectedSignature = generateSignature(body);
    if (expectedSignature !== receivedSignature) {
      console.warn("⚠️ PayFast ITN: signature mismatch", { orderId: body.m_payment_id });
      return;
    }

    // 2. Merchant ID check
    if (body.merchant_id !== process.env.PAYFAST_MERCHANT_ID) {
      console.warn("⚠️ PayFast ITN: merchant_id mismatch", { orderId: body.m_payment_id });
      return;
    }

    // 3. Source IP check (best-effort — see comment above)
    const sourceIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const ipOk = await looksLikePayfastIp(sourceIp);
    if (!ipOk) {
      console.warn("⚠️ PayFast ITN: source IP did not resolve to payfast.co.za", { sourceIp, orderId: body.m_payment_id });
      if (process.env.PAYFAST_STRICT_IP_CHECK === "true") return;
    }

    // 4. Look up the pending order
    const orders = readOrders();
    const idx = orders.findIndex((o) => o.id === body.m_payment_id);
    if (idx === -1) {
      console.warn("⚠️ PayFast ITN: no matching order", { orderId: body.m_payment_id });
      return;
    }
    const order = orders[idx];

    // 5. Amount check — protects against a tampered/replayed notification
    const expectedAmount = (order.amountTotal / 100).toFixed(2);
    if (Math.abs(parseFloat(body.amount_gross) - parseFloat(expectedAmount)) > 0.01) {
      console.warn("⚠️ PayFast ITN: amount mismatch", { orderId: body.m_payment_id, expected: expectedAmount, got: body.amount_gross });
      return;
    }

    // 6. Server-to-server confirmation with PayFast itself — the
    // definitive authenticity check per PayFast's integration guide.
    const validateRes = await fetch(validateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, signature: receivedSignature }).toString()
    });
    const validateText = (await validateRes.text()).trim();
    if (validateText !== "VALID") {
      console.warn("⚠️ PayFast ITN: validate endpoint returned", validateText, { orderId: body.m_payment_id });
      return;
    }

    // All checks passed.
    if (body.payment_status === "COMPLETE") {
      order.status = "paid";
      // Customer name/email/address were already captured on our own
      // checkout form before redirecting to PayFast — only fall back to
      // what PayFast sent if that's somehow missing.
      if (!order.customerName) order.customerName = [body.name_first, body.name_last].filter(Boolean).join(" ");
      if (!order.customerEmail) order.customerEmail = body.email_address || "";
      order.updatedAt = new Date().toISOString();
      orders[idx] = order;
      writeOrders(orders);
      console.log("✅ PayFast payment confirmed:", order.invoiceNumber);
    } else {
      console.log("ℹ️ PayFast ITN received with status:", body.payment_status, order.invoiceNumber);
    }
  } catch (err) {
    console.error("PayFast ITN handling error:", err.message);
  }
});

module.exports = router;
