// ── AquaServe — Firebase Configuration ───────────────────────────
// Wired to project: aquaserve-d9e6d
// ─────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  where,
  deleteDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAVDSe_SYexQ-LS-vfFz28QwZZihphzxAw",
  authDomain:        "aquaserve-d9e6d.firebaseapp.com",
  projectId:         "aquaserve-d9e6d",
  storageBucket:     "aquaserve-d9e6d.firebasestorage.app",
  messagingSenderId: "1080273777696",
  appId:             "1:1080273777696:web:61fae2bde6de14fbae3845",
  measurementId:     "G-JSKD0EGH9H"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export {
  app, auth, db,

  // Auth helpers
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,

  // Firestore helpers
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  where,
  deleteDoc,
  runTransaction
};