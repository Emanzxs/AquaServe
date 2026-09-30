# AquaServe — Setup Guide

This is a working web app skeleton, but it needs **your own** Firebase, Supabase,
and PayMongo accounts before it does anything live. Nothing here will work until
you complete these steps.

## 1. Firebase (Auth + Database)

1. Go to https://console.firebase.google.com → Create a project.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → Create database (start in production mode).
4. Go to **Project Settings → General → Your apps** → click the web icon (`</>`)
   to register a web app → copy the config object.
5. Paste that config into `firebase-config.js`, replacing the placeholder values.
6. Deploy the security rules in `firestore.rules`:
   ```
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point it at this project, use the existing firestore.rules
   firebase deploy --only firestore:rules
   ```
   **Do not skip this.** Without these rules, Firestore defaults to either
   fully locked (nothing works) or fully open (anyone can read/edit anyone's
   bills), depending on how you initialized the project.

## 2. Supabase (File Storage)

1. Go to https://supabase.com → Create a project.
2. **Storage** → Create a new bucket named `aquaserve`. Make it **public**
   (so uploaded photos/receipts can be viewed via URL).
3. **Storage → Policies** — add policies so that:
   - Anyone signed in can `INSERT` (upload) into the bucket.
   - Anyone can `SELECT` (read) from the bucket (since it's public).
   Example policy (SQL editor):
   ```sql
   create policy "Allow authenticated uploads"
   on storage.objects for insert
   to authenticated
   with check (bucket_id = 'aquaserve');

   create policy "Allow public read"
   on storage.objects for select
   to public
   using (bucket_id = 'aquaserve');
   ```
4. **Project Settings → API** → copy the **Project URL** and the
   **anon/public key** (NOT the service_role key — never put that in
   client code).
5. Paste both into `supabase-config.js`.

## 3. PayMongo (Payments) — ⚠️ Read this carefully

Your reference project (NORECO I) had its PayMongo **secret key** hardcoded
directly in `paymongo.js`, which ships to every visitor's browser. Anyone who
opened dev tools or viewed page source could read that key and use it to
create charges or read your payment data. **This is a real, exploitable
vulnerability, not just bad practice** — treat it the same way you'd treat a
leaked password, and rotate/regenerate the key in your PayMongo dashboard if
it was ever deployed publicly.

AquaServe fixes this by keeping the secret key server-side only:

1. Go to https://dashboard.paymongo.com → get your **Secret Key**
   (`sk_test_...` while developing, `sk_live_...` only when you go live)
   and your **Public Key** (`pk_...`, safe for client use if you need it later).
2. Set up the two small backend functions in `server/functions-index.js`:
   ```
   firebase init functions        # choose JavaScript
   # copy server/functions-index.js content into functions/index.js
   cd functions && npm install firebase-functions firebase-admin
   firebase functions:secrets:set PAYMONGO_SECRET_KEY
   # paste your sk_test_xxx or sk_live_xxx key when prompted
   firebase deploy --only functions
   ```
3. Note the deployed URLs (something like
   `https://us-central1-yourproject.cloudfunctions.net/createPaymentLink`).
4. Update `BACKEND_BASE` in `paymongo.js` to point at your functions
   (or set up Firebase Hosting rewrites so `/api/create-payment-link` maps
   to `createPaymentLink`, matching the paths already used in `paymongo.js`).
5. **Start with test mode keys** (`sk_test_...`) and PayMongo's test card
   numbers until the whole flow works end-to-end. Only switch to live keys
   when you're ready to accept real payments.

## 4. Hosting

Firebase Hosting works well since you're already using Firebase:
```
firebase init hosting
firebase deploy --only hosting
```

## 5. Creating your first Staff/Admin account

Self-registration always creates a `customer` role (both in the UI and
enforced by `firestore.rules`, so this can't be bypassed from the browser).
To create your first staff/admin user:
1. Register a normal account through `login.html`.
2. In the Firebase Console → Firestore → `users` collection, find that
   user's document and manually change `role` to `"staff"` or `"admin"`.
3. After that, admins can promote other users from the Admin Panel
   (`admin.html` → Manage Users → Change Role).

## What still needs work before a real launch

- The `payments` → `bills` status update (marking a bill "Paid" after a
  verified PayMongo payment) is intentionally **not** done directly from
  the browser, since customers shouldn't have write access to `/bills`.
  Wire this with a Cloud Function trigger on new `payments` documents,
  or have staff confirm it from the dashboard.
- Add real content for `assets/aquaserve-logo.png` and any banner images.
- Consider adding Firebase App Check to reduce API abuse from outside your app.
- Tighten the CORS origin in `server/functions-index.js` from `*` to your
  actual domain before going live.
