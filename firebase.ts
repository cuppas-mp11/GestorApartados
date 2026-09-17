import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Estos valores vienen de tu archivo .env.local (ver GUIA_FIREBASE.md, Paso 5)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// ignoreUndefinedProperties: evita el error "Unsupported field value: undefined"
// que aparece cuando un campo opcional (ej. nota o cliente en una venta) se deja
// vacío. Sin esto, Firestore rechaza el documento completo si algún campo llega
// como `undefined` en vez de simplemente omitirlo.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const auth = getAuth(app);
