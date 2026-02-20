import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAsyT7WP9wlV1iiZ-VeQ9Uovp5iPx8FBsk",
    authDomain: "stock-manager-d4318.firebaseapp.com",
    projectId: "stock-manager-d4318",
    storageBucket: "stock-manager-d4318.firebasestorage.app",
    messagingSenderId: "136877520396",
    appId: "1:136877520396:web:1ae93cab1035e8262de029",
    measurementId: "G-166MP8Q2HK"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);