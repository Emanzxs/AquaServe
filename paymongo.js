// AquaServe — client side of PayMongo. Holds NO secrets.
// Sends the signed-in user's Firebase ID token + a billId to our Cloud Function.
// The function looks up the amount itself and returns the PayMongo checkout URL.

const CREATE_CHECKOUT_URL = '/api/create-checkout'; // same-origin Vercel function

export async function startCheckout(billId, firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const resp = await fetch(CREATE_CHECKOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ billId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);
  window.location.href = json.checkoutUrl; // → PayMongo hosted page (GCash, Maya, card…)
}

// Backup check after returning from checkout (webhook is the main path).
export async function verifyPayment(billId, firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const r = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ billId }),
  });
  return (await r.json().catch(() => ({}))).paid === true;
}