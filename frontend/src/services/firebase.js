import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAKRJTrWDFcjZXcwuOx0I5E3kh7ZxkLcGY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "bancomobli.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "bancomobli",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "bancomobli.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "475630541710",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:475630541710:web:5a88a9ced63a4d7975e2df",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey
);

let app = null;
let db = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.warn('Firebase não inicializado:', e);
  }
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

export async function syncToFirestore(collectionName, docId, data) {
  if (!isFirebaseConfigured || !db) return;
  try {
    await setDoc(
      doc(db, collectionName, String(docId)),
      clean({ updatedAt: new Date().toISOString(), ...data }),
      { merge: true }
    );
  } catch (e) {
    console.warn('Erro ao sincronizar com o Firestore:', e);
  }
}

export const syncUser = (user) =>
  syncToFirestore('users', user?.id, {
    username: user?.username,
    role: user?.role,
    balance: user?.balance ?? 0,
    isBankrupt: user?.isBankrupt ?? 0,
  });

export const syncGameSnapshot = (state, users) =>
  syncToFirestore('gameState', 'main', {
    round: state?.round ?? 0,
    isStarted: state?.isStarted ?? 0,
    players: users ?? [],
  });

export const syncTransaction = (tx) =>
  syncToFirestore('transactions', tx?.id, {
    senderId: tx?.senderId,
    receiverId: tx?.receiverId,
    sender: tx?.sender,
    receiver: tx?.receiver,
    amount: tx?.amount ?? 0,
    timestamp: tx?.timestamp,
    status: tx?.status ?? 'completed',
  });

export const syncMarket = (property) =>
  syncToFirestore('properties', property?.id, {
    sellerId: property?.sellerId,
    sellerName: property?.sellerName,
    description: property?.description,
    numHouses: property?.numHouses ?? 0,
    askingPrice: property?.askingPrice ?? 0,
    bankOffer: property?.bankOffer ?? 0,
    status: property?.status ?? 'pending_admin',
    createdAt: property?.createdAt,
  });

export const syncLoans = (loans) =>
  Promise.all(
    (loans ?? []).map((l) =>
      syncToFirestore('loans', l?.id, {
        userId: l?.userId,
        username: l?.username,
        amount: l?.amount ?? 0,
        totalToPay: l?.totalToPay ?? 0,
        roundsLeft: l?.roundsLeft ?? 0,
      })
    )
  );

export { collection };
