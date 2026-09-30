// api/paymongo-webhook.js
const crypto = require('crypto');
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

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const sig = parts.li || parts.te;
  if (!parts.t || !sig) return false;
  const computed = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(computed), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);
  if (!verifySignature(rawBody, req.headers['paymongo-signature'], process.env.PAYMONGO_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(rawBody);
  if (event?.data?.attributes?.type !== 'checkout_session.payment.paid') {
    return res.status(200).send('ignored');
  }

  const session = event.data.attributes.data;
  const billId = session?.attributes?.metadata?.billId;
  const payment = (session?.attributes?.payments || [])[0];
  if (!billId) return res.status(200).send('no billId');

  const billRef = db.collection('bills').doc(billId);
  const snap = await billRef.get();
  if (snap.exists && snap.data().status !== 'Paid') {
    await billRef.update({
      status: 'Paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentMethod: payment?.attributes?.source?.type || 'online',
      paymentRef: payment?.id || session.id,
    });
  }

  res.status(200).send('ok');
};