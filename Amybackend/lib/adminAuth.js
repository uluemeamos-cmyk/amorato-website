/**
 * Minimal admin protection for order-management endpoints.
 * Not enterprise auth — a shared secret key is enough for a small team
 * managing orders themselves, but don't reuse this key anywhere public.
 */
module.exports = function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) {
    return res.status(500).json({
      error: "ADMIN_API_KEY is not set on the server. Add one to backend/.env and restart."
    });
  }
  const provided = req.headers["x-admin-key"];
  if (provided !== configured) {
    return res.status(401).json({ error: "Unauthorized — wrong or missing admin key." });
  }
  next();
};
