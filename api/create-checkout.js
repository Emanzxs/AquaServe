// api/create-checkout.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

function authHeader() {
  return 'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { billId } = req.body || {};
    if (!billId) return res.status(400).json({ error: 'billId is required' });

    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) return res.status(401).json({ error: 'Not logged in' });

    const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired login' });

    const billRef = db.collection('bills').doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) return res.status(404).json({ error: 'Bill not found' });

    const bill = billSnap.data();
    if (bill.uid !== decoded.uid) return res.status(403).json({ error: 'Not your bill' });
    if (bill.status === 'Paid') return res.status(409).json({ error: 'Already paid' });

    const amountCentavos = Math.round(Number(bill.amount) * 100);
    if (!(amountCentavos > 0)) return res.status(400).json({ error: 'Invalid bill amount' });

    const base = process.env.PUBLIC_BASE_URL;

    const resp = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: { name: bill.customerName || decoded.email, email: decoded.email },
            line_items: [{ name: `Water bill (${bill.period || billId})`, amount: amountCentavos, currency: 'PHP', quantity: 1 }],
            payment_method_types: ['gcash', 'paymaya', 'card'],
            success_url: `${base}/billing.html?pm=success&bill=${billId}`,
            cancel_url: `${base}/billing.html?pm=cancelled&bill=${billId}`,
            metadata: { billId, uid: decoded.uid },
          },
        },
      }),
    });
    const json = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: json?.errors?.[0]?.detail || 'PayMongo error' });

    await billRef.set({ paymongoCheckoutSessionId: json.data.id }, { merge: true });

    res.status(200).json({ checkoutUrl: json.data.attributes.checkout_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};