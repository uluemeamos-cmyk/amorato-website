/**
 * Best-effort tracking URL templates for common couriers. Courier sites
 * change their URL formats occasionally — if a link stops working, use
 * "Other / Manual link" and paste the tracking link the courier emailed
 * you directly instead.
 */
const carriers = {
  "courier-guy": { label: "The Courier Guy", urlTemplate: "https://www.thecourierguy.co.za/track?ref={tracking}" },
  "postnet": { label: "PostNet", urlTemplate: "https://www.postnet.co.za/track-trace?wbn={tracking}" },
  "dhl": { label: "DHL Express", urlTemplate: "https://www.dhl.com/za-en/home/tracking/tracking-express.html?submit=1&tracking-id={tracking}" },
  "aramex": { label: "Aramex", urlTemplate: "https://www.aramex.com/track/results?ShipmentNumber={tracking}" },
  "fedex": { label: "FedEx", urlTemplate: "https://www.fedex.com/fedextrack/?trknbr={tracking}" },
  "other": { label: "Other / Manual link", urlTemplate: null }
};

// If a manual URL is provided, it always wins. Otherwise build one from
// the carrier template + tracking number, if both are present.
function buildTrackingUrl(carrierKey, trackingNumber, manualUrl) {
  if (manualUrl) return manualUrl;
  const carrier = carriers[carrierKey];
  if (!carrier || !carrier.urlTemplate || !trackingNumber) return null;
  return carrier.urlTemplate.replace("{tracking}", encodeURIComponent(trackingNumber));
}

module.exports = { carriers, buildTrackingUrl };
