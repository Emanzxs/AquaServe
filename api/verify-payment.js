// api/verify-payment.js
// POST { billId } with Authorization: Bearer <Firebase ID token>
// → asks PayMongo directly whether that bill's checkout session is paid.
// If yes, marks the bill Paid (idempotent) and returns { paid: true }.
//
// This is the BACKUP path. The webhook (api/paymongo-webhook.js) is the
// primary path and should normally mark the bill Paid within a second or
// two of the customer completing checkout — this endpoint exists so the
// billing page can double-check even if a webhook delivery is delayed.

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

    const authHead = req.headers.authorization || '';
    const idToken = authHead.startsWith('Bearer ') ? authHead.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Missing Authorization bearer token' });

    const admin = getAdmin();
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    const uid = decoded.uid;

    const db = admin.firestore();
    const billRef = db.collection('bills').doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) return res.status(404).json({ error: 'Bill not found' });

    const bill = billSnap.data();
    if (bill.uid !== uid) return res.status(403).json({ error: 'This bill does not belong to you' });

    if (bill.status === 'Paid') return res.status(200).json({ paid: true });

    const sessionId = bill.paymongoCheckoutSessionId;
    if (!sessionId) return res.status(200).json({ paid: false });

    const resp = await fetch(`${PAYMONGO_API}/checkout_sessions/${sessionId}`, {
      headers: { Authorization: authHeader() },
    });
    const json = await resp.json();
    if (!resp.ok) {
      console.error('PayMongo verify-payment error:', JSON.stringify(json));
      return res.status(200).json({ paid: false });
    }

    const payments = json.data?.attributes?.payments || [];
    const paidPayment = payments.find((p) => p.attributes?.status === 'paid');

    if (paidPayment) {
      await markBillPaid(db, billRef, bill, {
        paymentRef: paidPayment.id,
        paymentMethod: paidPayment.attributes?.source?.type || 'online',
      });
      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({ paid: false });
  } catch (err) {
    console.error('verify-payment fatal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Shared, idempotent "mark as paid" writer — also used by the webhook.
async function markBillPaid(db, billRef, bill, { paymentRef, paymentMethod }) {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(billRef);
    if (!fresh.exists || fresh.data().status === 'Paid') return; // already handled
    tx.update(billRef, {
      status: 'Paid',
      paidAt: db.constructor.FieldValue ? db.constructor.FieldValue.serverTimestamp() : new Date(),
      paymentMethod,
      paymentRef,
    });
    const paymentDocId = 'pm-' + paymentRef;
    tx.set(db.collection('payments').doc(paymentDocId), {
      uid: bill.uid,
      billId: billRef.id,
      amount: bill.amount,
      method: paymentMethod,
      status: 'Verified',
      source: 'paymongo',
      paymentRef,
      createdAt: new Date(),
    });
  });
}

module.exports.markBillPaid = markBillPaid;