const crypto = require("crypto");

/**
 * PayFast only ever processes in South African Rand. Amounts everywhere
 * in this backend are stored as ZAR cents (e.g. 22000 = R220.00), same
 * as before — PayFast just needs them formatted as a decimal string.
 */
function formatAmount(cents) {
  return ((cents || 0) / 100).toFixed(2);
}

function isLive() {
  return (process.env.PAYFAST_MODE || "sandbox").toLowerCase() === "live";
}

function processUrl() {
  return isLive() ? "https://www.payfast.co.za/eng/process" : "https://sandbox.payfast.co.za/eng/process";
}

function validateUrl() {
  // PayFast migrated their live validation endpoint from
  // www.payfast.co.za to api.payfast.co.za — sandbox stayed the same.
  return isLive()
    ? "https://api.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

/**
 * PHP's urlencode() (which is what PayFast's own signature verification
 * is built around) escapes a handful of characters that JavaScript's
 * encodeURIComponent leaves as literals: ! * ' ( ) — and uses "+" for
 * spaces, same as encodeURIComponent already gets patched to do below.
 * Missing this is a common, hard-to-spot cause of "signature mismatch"
 * style rejections — it only shows up when a field happens to contain
 * one of these characters (an apostrophe in a name, for example), so it
 * can pass casual testing and then fail on a real order.
 */
function phpUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * PayFast's signature is an MD5 hash of the fields URL-encoded in the
 * EXACT order they're given here — not alphabetical. Passphrase is only
 * appended if one is actually configured; including an empty passphrase
 * in the string is a common cause of "signature mismatch" bugs.
 *
 * `fields` should be a plain object (or anything Object.entries works on)
 * already in the order you want signed — for our own outgoing requests
 * that's the order we build them in; for verifying an incoming ITN, pass
 * the parsed body object with `signature` already removed.
 */
function generateSignature(fields) {
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  let pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${phpUrlEncode(String(value).trim())}`);

  let queryString = pairs.join("&");
  if (passphrase) {
    queryString += `&passphrase=${phpUrlEncode(passphrase.trim())}`;
  }
  return crypto.createHash("md5").update(queryString).digest("hex");
}

module.exports = { formatAmount, isLive, processUrl, validateUrl, generateSignature };
