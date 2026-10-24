import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9MAj5XBeF7d_wA2wb9teId1dOZ7athpw",
  authDomain: "flow-automate-94943.firebaseapp.com",
  projectId: "flow-automate-94943",
  storageBucket: "flow-automate-94943.firebasestorage.app",
  messagingSenderId: "711390990886",
  appId: "1:711390990886:web:3053d7f4f3de6ea5bb0ce7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);