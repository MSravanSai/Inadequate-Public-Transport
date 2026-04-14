import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
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
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, auth, googleProvider };
