(function () {
  "use strict";

  const API_BASE = window.location.origin; // admin is served by the same backend
  const KEY_STORAGE = "amorato_admin_key";

  const keyInput = document.getElementById("admin-key");
  const connectBtn = document.getElementById("connect-btn");
  const app = document.getElementById("app");
  const ordersList = document.getElementById("orders-list");
  const orderCount = document.getElementById("order-count");
  const statusMsg = document.getElementById("status-msg");
  const refreshBtn = document.getElementById("refresh-btn");
  const rowTemplate = document.getElementById("order-row-template");

  let carriers = {};

  function adminHeaders() {
    return { "x-admin-key": keyInput.value, "Content-Type": "application/json" };
  }

  function money(cents, currency) {
    return `${(currency || "ZAR").toUpperCase()} ${((cents || 0) / 100).toFixed(2)}`;
  }

  async function loadCarriers() {
    const res = await fetch(`${API_BASE}/api/orders/carriers`, { headers: adminHeaders() });
    if (res.ok) carriers = await res.json();
  }

  function carrierOptions(selected) {
    return Object.entries(carriers)
      .map(([key, c]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${c.label}</option>`)
      .join("");
  }

  function renderOrder(order) {
    const node = rowTemplate.content.cloneNode(true);
    const card = node.querySelector(".order-card");
    card.dataset.id = order.id;

    node.querySelector(".order-card__invoice").textContent = order.invoiceNumber;
    node.querySelector(".order-card__date").textContent = new Date(order.createdAt).toLocaleString();
    const pdfLink = node.querySelector(".order-card__pdf");
    pdfLink.href = "#";
    // The invoice route checks the x-admin-key HEADER, which a plain link
    // click can't send — so fetch it with the header and open the result.
    pdfLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(order.id)}/invoice`, {
        headers: adminHeaders()
      });
      if (!res.ok) return alert("Could not load invoice.");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    });

    node.querySelector(".order-card__name").textContent = order.customerName || "(no name)";
    node.querySelector(".order-card__email").textContent = order.customerEmail || "";
    const addr = order.shippingAddress;
    node.querySelector(".order-card__address").textContent = addr
      ? [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(", ")
      : "No shipping address";

    const itemsEl = node.querySelector(".order-card__items");
    (order.items || []).forEach((item) => {
      const row = document.createElement("div");
      row.innerHTML = `<span>${item.quantity} &times; ${item.description}</span><span>${money(item.amountTotal, order.currency)}</span>`;
      itemsEl.appendChild(row);
    });

    node.querySelector(".order-card__total").textContent = money(order.amountTotal, order.currency);

    const statusSelect = node.querySelector(".field-status");
    statusSelect.value = order.status;

    const carrierSelect = node.querySelector(".field-carrier");
    carrierSelect.innerHTML = carrierOptions(order.tracking.carrier);

    node.querySelector(".field-tracking-number").value = order.tracking.number || "";
    node.querySelector(".field-tracking-manual").value = "";

    node.querySelector(".field-save").addEventListener("click", async () => {
      const saveStatus = node.querySelector(".save-status");
      saveStatus.textContent = "Saving…";
      const body = {
        status: statusSelect.value,
        trackingCarrier: carrierSelect.value,
        trackingNumber: node.querySelector(".field-tracking-number").value,
        trackingUrlManual: node.querySelector(".field-tracking-manual").value || undefined,
        notifyCustomer: node.querySelector(".field-notify").checked
      };
      try {
        const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(order.id)}`, {
          method: "PATCH",
          headers: adminHeaders(),
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        saveStatus.textContent = data.emailSent ? "Saved — email sent ✓" : "Saved ✓";
      } catch (err) {
        saveStatus.textContent = "Error saving — check admin key.";
      }
    });

    return node;
  }

  async function loadOrders() {
    statusMsg.textContent = "Loading orders…";
    try {
      const res = await fetch(`${API_BASE}/api/orders`, { headers: adminHeaders() });
      if (res.status === 401) throw new Error("Wrong admin key.");
      if (!res.ok) throw new Error("Could not load orders.");
      const orders = await res.json();

      ordersList.innerHTML = "";
      if (!orders.length) {
        ordersList.innerHTML = '<p style="color:var(--cream-dim)">No orders yet. They\'ll show up here the moment a real PayFast payment completes.</p>';
      } else {
        orders.forEach((order) => ordersList.appendChild(renderOrder(order)));
      }
      orderCount.textContent = `${orders.length} order${orders.length === 1 ? "" : "s"}`;
      statusMsg.textContent = "";
      app.hidden = false;
    } catch (err) {
      statusMsg.textContent = err.message;
      app.hidden = true;
    }
  }

  connectBtn.addEventListener("click", async () => {
    localStorage.setItem(KEY_STORAGE, keyInput.value);
    await loadCarriers();
    await loadOrders();
  });
  refreshBtn.addEventListener("click", loadOrders);

  // Restore a previously entered key so you don't retype it every visit.
  const savedKey = localStorage.getItem(KEY_STORAGE);
  if (savedKey) {
    keyInput.value = savedKey;
    loadCarriers().then(loadOrders);
  }
})();
