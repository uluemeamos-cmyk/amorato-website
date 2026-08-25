const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const router = express.Router();
const enquiriesFile = path.join(__dirname, "..", "data", "enquiries.json");

function saveEnquiryLocally(entry) {
  let all = [];
  try {
    all = JSON.parse(fs.readFileSync(enquiriesFile, "utf8"));
  } catch {
    all = [];
  }
  all.push(entry);
  fs.writeFileSync(enquiriesFile, JSON.stringify(all, null, 2));
}

async function sendEmail(entry) {
  if (!process.env.SMTP_HOST) return false; // email not configured — that's fine
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.CONTACT_FROM_EMAIL,
    to: process.env.CONTACT_TO_EMAIL,
    subject: `New enquiry — ${entry.enquiryType || "General"} — ${entry.name}`,
    text: `Name: ${entry.name}\nEmail: ${entry.email}\nType: ${entry.enquiryType}\n\n${entry.message}`
  });
  return true;
}

// POST /api/contact
router.post("/", async (req, res) => {
  const { name, email, message, enquiryType } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  const entry = {
    name,
    email,
    message: message || "",
    enquiryType: enquiryType || "general",
    receivedAt: new Date().toISOString()
  };

  saveEnquiryLocally(entry);

  try {
    await sendEmail(entry);
  } catch (err) {
    console.error("Email send failed (enquiry was still saved):", err.message);
  }

  res.json({ ok: true });
});

module.exports = router;
