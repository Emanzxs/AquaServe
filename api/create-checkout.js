// api/create-checkout.js
// POST { billId } with Authorization: Bearer <Firebase ID token>
// → creates a PayMongo Checkout Session for that bill and returns its URL.
//
// SECURITY NOTES (why it's built this way):
// - The client never sends an amount. We look up the bill's amount in
//   Firestore ourselves, so a tampered request can't pay a different price.
// - We verify the Firebase ID token server-side, so billId can't be paid
//   "as" another user.
// - We store the PayMongo checkout session id on the bill doc, so the
//   webhook can find the right bill when PayMongo calls us back.
//
// Env vars required (Vercel → Settings → Environment Variables):
//   PAYMONGO_SECRET_KEY     (from PayMongo Dashboard → Developers → API Keys — SECRET key, not public)
//   PUBLIC_BASE_URL         (e.g. https://aquaserve.vercel.app — used to build success/cancel redirect URLs)
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (see lib/firebaseAdmin.js)

const { getAdmin } = require('../lib/firebaseAdmin');

const PAYMONGO_API = 'https://api.paymongo.com/v1';

function authHeader() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error('PAYMONGO_SECRET_KEY is not set');
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { billId } = req.body || {};
    if (!billId) return res.status(400).json({ error: 'billId is required' });

    // 1) Verify the caller's identity from the Firebase ID token.
    const authHead = req.headers.authorization || '';
    const idToken = authHead.startsWith('Bearer ') ? authHead.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Missing Authorization bearer token' });

    const admin = getAdmin();
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    const uid = decoded.uid;

    // 2) Load the bill from Firestore — amount comes from HERE, never from the client.
    const db = admin.firestore();
    const billRef = db.collection('bills').doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) return res.status(404).json({ error: 'Bill not found' });

    const bill = billSnap.data();
    if (bill.uid !== uid) return res.status(403).json({ error: 'This bill does not belong to you' });
    if (bill.status === 'Paid') return res.status(409).json({ error: 'This bill is already paid' });

    const amountPesos = Number(bill.amount);
    if (!(amountPesos > 0)) return res.status(400).json({ error: 'Bill has an invalid amount' });
    const amountCentavos = Math.round(amountPesos * 100); // PayMongo uses the smallest currency unit

    // 3) Create the PayMongo Checkout Session.
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) throw new Error('PUBLIC_BASE_URL is not set');

    const payload = {
      data: {
        attributes: {
          billing: { name: bill.customerName || decoded.name || decoded.email, email: decoded.email },
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: `AquaServe water bill — ${bill.period || billId}`,
          line_items: [
            {
              name: `Water bill (${bill.period || billId})`,
              amount: amountCentavos,
              currency: 'PHP',
              quantity: 1,
            },
          ],
          payment_method_types: ['gcash', 'paymaya', 'card'],
          success_url: `${base}/billing.html?pm=success&bill=${encodeURIComponent(billId)}`,
          cancel_url: `${base}/billing.html?pm=cancelled&bill=${encodeURIComponent(billId)}`,
          // Custom metadata we can read back later (webhook, or a manual dashboard lookup)
          metadata: { billId, uid },
        },
      },
    };

    const resp = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();

    if (!resp.ok) {
      console.error('PayMongo create-checkout error:', JSON.stringify(json));
      const msg = json?.errors?.[0]?.detail || 'Failed to create checkout session';
      return res.status(502).json({ error: msg });
    }

    const session = json.data;
    const checkoutUrl = session.attributes.checkout_url;

    // 4) Remember the session id on the bill so the webhook can match it back.
    await billRef.set(
      {
        paymongoCheckoutSessionId: session.id,
        paymentStatus: 'Awaiting payment',
      },
      { merge: true }
    );

    return res.status(200).json({ checkoutUrl });
  } catch (err) {
    console.error('create-checkout fatal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};