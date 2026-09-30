// AquaServe — client side of PayMongo. Holds NO secrets.
//
// Flow: same-tab redirect (matches billing.html's existing handleReturn()).
// 1. startCheckout() calls our server, which creates a PayMongo Checkout
//    Session and returns its URL. We redirect the whole tab there.
// 2. Customer pays on PayMongo's hosted page.
// 3. PayMongo redirects the SAME tab back to billing.html?pm=...&bill=...
// 4. The real "mark as Paid" happens server-side via webhook
//    (api/paymongo-webhook.js) — independent of this file entirely.
// 5. billing.html's onSnapshot listener picks up that Firestore change
//    live, so verifyPayment() below is only a short backup poll in case
//    the webhook is a few seconds slow.

const API_CREATE_CHECKOUT = '/api/create-checkout';
const API_VERIFY = '/api/verify-payment';

// Remember which bill we're paying, so a returning tab (or a page refresh
// mid-confirmation) can still make sense of the pm=success redirect even
// if in-memory state was lost.
function _rememberPending(billId, amount) {
  try {
    sessionStorage.setItem('aqua_pm_pending', JSON.stringify({ billId, amount, timestamp: Date.now() }));
  } catch (e) { /* sessionStorage unavailable — non-fatal */ }
}
function _readPending() {
  try { return JSON.parse(sessionStorage.getItem('aqua_pm_pending') || 'null'); }
  catch (e) { return null; }
}
function _clearPending() {
  try { sessionStorage.removeItem('aqua_pm_pending'); } catch (e) {}
}

export async function startCheckout(billId, firebaseUser, amount) {
  const idToken = await firebaseUser.getIdToken();
  const resp = await fetch(API_CREATE_CHECKOUT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ billId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);
  if (!json.checkoutUrl) throw new Error('No checkout URL returned.');

  _rememberPending(billId, amount);
  window.location.href = json.checkoutUrl; // → PayMongo hosted page (GCash, Maya, card…)
}

// Single check against our server (server asks PayMongo / reads Firestore).
export async function verifyPayment(billId, firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const r = await fetch(API_VERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ billId }),
  });
  const json = await r.json().catch(() => ({}));
  return json.paid === true;
}

// Poll verifyPayment every `intervalMs` until paid or `maxAttempts` reached.
// Used as a backup right after redirect-back, in case the webhook (the
// primary path) takes a moment to land. Returns a cancel function.
export function pollUntilPaid(billId, firebaseUser, { onPaid, onTimeout, intervalMs = 4000, maxAttempts = 15 } = {}) {
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    try {
      if (await verifyPayment(billId, firebaseUser)) {
        clearInterval(timer);
        _clearPending();
        onPaid && onPaid();
        return;
      }
    } catch (e) {
      console.error('[PayMongo] poll error:', e);
    }
    if (attempts >= maxAttempts) {
      clearInterval(timer);
      onTimeout && onTimeout();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

// Optional helper: read back what was being paid, e.g. if you want to show
// "Confirming payment of ₱280.00…" instead of a generic message.
export function getPendingPayment() {
  return _readPending();
}