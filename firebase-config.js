// js/firebase-config.js
// Copie aqui a configuração do seu projeto Firebase (já tinha no seu HTML)
// Atualize se precisar (eu mantive a sua config como exemplo)
const firebaseConfig = {
  apiKey: "AIzaSyDo0derCafHAAAo09JrI3uwFabRodMKLJ0",
  authDomain: "felito-8bd08.firebaseapp.com",
  projectId: "felito-8bd08",
  storageBucket: "felito-8bd08.firebasestorage.app",
  messagingSenderId: "664617575774",
  appId: "1:664617575774:web:bf4258eb5db544857f5bcf"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db = firebase.firestore();
