
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCL9dN0qpm41cpcfSbLPQD29zQvhmYPm6Y",
    authDomain: "ciliguide.firebaseapp.com",
    projectId: "ciliguide",
    storageBucket: "ciliguide.firebasestorage.app",
    messagingSenderId: "372403460160",
    appId: "1:372403460160:web:77f32ac6ef1c8c5b8ee7a5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export for use in other files
export { app, auth, db };