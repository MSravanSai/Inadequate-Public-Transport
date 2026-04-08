// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDDwCWYm0ev_p9kGywCxIbd4TpPuiIDxYw",
  authDomain: "inadequate-bus-transport.firebaseapp.com",
  projectId: "inadequate-bus-transport",
  storageBucket: "inadequate-bus-transport.firebasestorage.app",
  messagingSenderId: "831039863906",
  appId: "1:831039863906:web:c0bcec9b45c003de90e53b",
  measurementId: "G-QYE537QDCG"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export { app };
