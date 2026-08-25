const nodemailer = require("nodemailer");

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// Returns true if an email was actually sent, false if SMTP isn't configured
// (which is fine — the caller should treat that as "not sent yet" rather
// than an error).
async function sendMail({ to, subject, text }) {
  const transporter = getTransporter();
  if (!transporter) return false;
  await transporter.sendMail({
    from: process.env.CONTACT_FROM_EMAIL,
    to,
    subject,
    text
  });
  return true;
}

module.exports = { sendMail };
