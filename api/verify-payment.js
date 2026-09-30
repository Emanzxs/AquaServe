// api/verify-payment.js
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

    if (bill.status === 'Paid') return res.status(200).json({ paid: true });
    if (!bill.paymongoCheckoutSessionId) return res.status(200).json({ paid: false });

    const resp = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${bill.paymongoCheckoutSessionId}`, {
      headers: { Authorization: authHeader() },
    });
    const json = await resp.json();
    const paidPayment = (json.data?.attributes?.payments || []).find(p => p.attributes?.status === 'paid');

    if (paidPayment) {
      await billRef.update({
        status: 'Paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod: paidPayment.attributes?.source?.type || 'online',
        paymentRef: paidPayment.id,
      });
      return res.status(200).json({ paid: true });
    }

    res.status(200).json({ paid: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};