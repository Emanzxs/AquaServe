// ── AquaServe — Supabase Configuration ────────────────────────────
// Handles ALL file uploads for: report.html, billing.html
//
// 🔧 SETUP:
//   1. Create a project at https://supabase.com
//   2. Create a public Storage bucket named "aquaserve"
//   3. Paste your Project URL + "anon public" key below
//   4. Set Storage RLS policies (see SETUP.md)
//
// BUCKET LAYOUT (all inside the "aquaserve" bucket):
//   reports/{refNum}/                 ← problem-report photos
//   receipts/{accountNumber}/{billId}/ ← bill payment receipt images
// ─────────────────────────────────────────────────────────────────

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ── 🔧 PASTE YOUR SUPABASE PROJECT DETAILS HERE ──────────────────
export const supabase = createClient(
  'https://YOUR_PROJECT_REF.supabase.co',
  'YOUR_ANON_PUBLIC_KEY'
);
// ──────────────────────────────────────────────────────────────────

const BUCKET = 'aquaserve';

/**
 * Upload a file to Supabase Storage.
 * @param {File}   file
 * @param {string} folder      - e.g. 'reports/REQ-2026-1234'
 * @param {object} [opts]
 * @param {string} [opts.customName]
 * @param {number} [opts.maxMB=10]
 * @returns {Promise<string>}  Public URL of the uploaded file
 */
export async function uploadFile(file, folder, opts = {}) {
  const { customName, maxMB = 10 } = opts;

  if (file.size > maxMB * 1024 * 1024) {
    throw new Error(`File too large. Maximum allowed size is ${maxMB} MB.`);
  }

  const ext      = (file.name.split('.').pop() || 'bin').toLowerCase();
  const safeName = customName
    ? customName.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const filePath = `${folder.replace(/\/+$/, '')}/${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      upsert:       true,
      cacheControl: '3600',
      contentType:  file.type || 'application/octet-stream',
    });

  if (uploadError) {
    const msg = uploadError.message || JSON.stringify(uploadError);
    if (
      msg.toLowerCase().includes('row-level security') ||
      msg.toLowerCase().includes('violates') ||
      uploadError.statusCode === '403' ||
      uploadError.status === 403
    ) {
      throw new Error(
        'STORAGE_RLS: Upload blocked by Supabase storage policy. See SETUP.md to fix this.'
      );
    }
    throw new Error(msg);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(uploadData?.path ?? filePath);

  return urlData.publicUrl;
}

/** Upload a problem-report photo. Folder: reports/{refNum} */
export async function uploadReportPhoto(file, refNum) {
  return uploadFile(file, `reports/${refNum}`, { maxMB: 10 });
}

/** Upload a bill payment receipt. Folder: receipts/{accountNumber}/{billId} */
export async function uploadBillReceipt(file, accountNumber, billId, refNumber) {
  const safeRef = String(refNumber || 'manual').replace(/[^a-zA-Z0-9\-_]/g, '_');
  return uploadFile(file, `receipts/${accountNumber}/${billId}/ref_${safeRef}`, { maxMB: 5 });
}
