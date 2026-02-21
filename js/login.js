import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Toggle between Login and Register and CLEAR fields
window.toggleView = function(isRegister) {
    const container = document.getElementById("authContainer");
    
    // Clear all inputs
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => input.value = "");
    
    if (isRegister) {
        container.classList.add("show-register");
    } else {
        container.classList.remove("show-register");
    }
};

// -------- LOGIN FUNCTION --------
window.login = async function(){
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPass").value;

  if(!email || !password) return alert("Please enter both email and password.");

  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const user = res.user;

    const snap = await getDoc(doc(db, "users", user.uid));
    if(!snap.exists()) return alert("User role not found.");

    const role = snap.data().role;
    window.location.href = (role === "admin") ? "admin.html" : "employee.html";

  } catch(err) {
    alert("Login Failed: " + err.message);
  }
};

// -------- REGISTER FUNCTION --------
window.register = async function(){
  const name = document.getElementById("regName").value;
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPass").value;

  if(!name || !email || !password) return alert("Please fill in all fields.");
  if(password.length < 6) return alert("Password must be at least 6 characters.");

  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    const user = res.user;

    // Save user with default "employee" role
    await setDoc(doc(db, "users", user.uid), {
      name: name,
      email: email,
      role: "employee",
      createdAt: new Date()
    });

    alert("Registration Successful!");
    window.location.href = "employee.html";

  } catch(err) {
    alert("Registration Failed: " + err.message);
  }
};