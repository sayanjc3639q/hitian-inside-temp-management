import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDdcV5p27IsSlfo5DpFINk7rwXZCHJWLNE",
  authDomain: "temp-indise.firebaseapp.com",
  projectId: "temp-indise",
  storageBucket: "temp-indise.firebasestorage.app",
  messagingSenderId: "589931981057",
  appId: "1:589931981057:web:d5da9e64294e06b145d300",
  measurementId: "G-ZEW3EB992D"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
