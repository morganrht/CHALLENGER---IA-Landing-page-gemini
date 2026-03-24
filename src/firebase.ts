import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, Timestamp, getDocFromServer } from 'firebase/firestore';

// In AI Studio, this file is normally created by the set_up_firebase tool.
// If it's missing, we use placeholders.
const firebaseConfig = {
  apiKey: "AIzaSy...", // Placeholder
  authDomain: "challenger-ia.firebaseapp.com",
  projectId: "challenger-ia",
  storageBucket: "challenger-ia.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
  firestoreDatabaseId: "(default)"
};

// Try to import the real config if it exists (it might be injected later)
// @ts-ignore
import realConfig from './firebase-applet-config.json' assert { type: 'json' };
const config = realConfig || firebaseConfig;

const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app, config.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export { 
  signInWithPopup, 
  signOut, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  Timestamp,
  getDocFromServer
};

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();
