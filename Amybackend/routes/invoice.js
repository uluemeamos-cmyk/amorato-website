const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAdmin = require("../lib/adminAuth");

// Loaded defensively — if node_modules is out of date and pdfkit isn't
// installed, this used to crash the ENTIRE server at startup (a missing
// module fails the top-level `require`, which fails server.js's require
// of this whole file). Now the rest of the backend keeps working, and
// only the invoice endpoint itself reports the real problem.
let PDFDocument = null;
try {
  PDFDocument = require("pdfkit");
} catch {
  console.error(
    "⚠️  pdfkit is not installed — invoice PDFs won't work until you run `npm install` in backend/. Everything else still works fine."
  );
}

const router = express.Router();
const ordersFile = path.join(__dirname, "..", "data", "orders.json");
const logoPath = path.join(__dirname, "..", "assets", "amorato-crest.png");

function formatCurrency(cents, currency) {
  const amount = ((cents || 0) / 100).toFixed(2);
  return `${(currency || "ZAR").toUpperCase()} ${amount}`;
}

// GET /api/orders/:id/invoice — streams a PDF invoice for one order
router.get("/:id/invoice", requireAdmin, (req, res) => {
  if (!PDFDocument) {
    return res.status(500).json({ error: "pdfkit is not installed. Run `npm install` in backend/ and restart the server." });
  }

  let orders;
  try {
    orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch {
    orders = [];
  }
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${order.invoiceNumber}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // --- Header -------------------------------------------------------
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { width: 55 });
  }
  doc.fontSize(18).fillColor("#1b1200").text("THE HOUSE OF AMORATO", 120, 48);
  doc.fontSize(9).fillColor("#8A6D1F").text("UNITY  \u00b7  LOVE  \u00b7  STRENGTH", 120, 70);

  doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#C9A227").stroke();

  // --- Invoice meta / bill-to ----------------------------------------
  doc.fontSize(15).fillColor("#000").text(`Invoice ${order.invoiceNumber}`, 50, 130);
  doc.fontSize(10).fillColor("#333")
    .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 50, 155)
    .text(`Status: ${order.status}`, 50, 170);

  doc.fontSize(10).fillColor("#333").text("Bill To:", 340, 130);
  doc.text(order.customerName || "\u2014", 340, 145);
  doc.text(order.customerEmail || "", 340, 160);
  if (order.shippingAddress) {
    const a = order.shippingAddress;
    const addrLine = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ");
    doc.text(addrLine, 340, 175, { width: 205 });
  }

  // --- Line items table -----------------------------------------------
  let y = 230;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 8;
  doc.fontSize(10).fillColor("#000")
    .text("Item", 50, y)
    .text("Qty", 380, y)
    .text("Amount", 470, y);
  y += 16;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 10;

  (order.items || []).forEach((item) => {
    doc.fontSize(10).fillColor("#333")
      .text(item.description || "", 50, y, { width: 310 })
      .text(String(item.quantity ?? ""), 380, y)
      .text(formatCurrency(item.amountTotal, order.currency), 470, y);
    y += 20;
  });

  y += 8;
  doc.moveTo(340, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 8;
  doc.fontSize(12).fillColor("#000")
    .text("Total", 340, y)
    .text(formatCurrency(order.amountTotal, order.currency), 470, y);

  if (order.tracking && order.tracking.url) {
    y += 30;
    doc.fontSize(9).fillColor("#555").text(`Tracking: ${order.tracking.url}`, 50, y, { width: 495 });
  }

  // --- Footer -----------------------------------------------------------
  doc.fontSize(8).fillColor("#999").text(
    "Please enjoy Amorato responsibly. Not for sale or delivery to anyone under the legal drinking age in their jurisdiction.",
    50,
    780,
    { width: 495, align: "center" }
  );

  doc.end();
});

module.exports = router;
