const firebaseConfig = {
  apiKey: "AIzaSyDzs75cgOPRzG2q_6_ofCIJ-lTKcSB3YK4",
  authDomain: "chattrix-e70e2.firebaseapp.com",
  projectId: "chattrix-e70e2",
  storageBucket: "chattrix-e70e2.firebasestorage.app",
  messagingSenderId: "381880163728",
  appId: "1:381880163728:web:cf07f5fdf20e7b3edfa715",
  measurementId: "G-WHTCTFD1JN"
};
// ------------------------------------------------------------

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const lockScreen = document.getElementById("lockScreen");


let mode = "login"; // login or signup

function toggleMode() {
    const title = document.getElementById("title");
    const btn = document.getElementById("login-btn");
    const switcher = document.querySelector(".switch");

    if (mode === "login") {
        mode = "signup";
        title.innerText = "Create Account";
        btn.innerText = "Sign Up";
        switcher.innerText = "Already have an account? Login";
    } else {
        mode = "login";
        title.innerText = "Login";
        btn.innerText = "Login";
        switcher.innerText = "Don't have an account? Create One";
    }
}

document.getElementById("login-btn").addEventListener("click", () => {
    const email = document.getElementById("Email").value.trim();
    const password = document.getElementById("password").value;

    // ------------ Email must end with ac.in ------------
    if (!email.endsWith("ac.in")) {
        document.getElementById("msg").innerText = "Only ac.in emails allowed!";
        return;
    }
    // ----------------------------------------------------

    if (mode === "login") {
        login(email, password);
    } else {
        signup(email, password);
    }
});

function signup(email, password) {
  auth.createUserWithEmailAndPassword(email, password)
    .then(async (cred) => {
      // ✅ SEND VERIFICATION EMAIL
      await cred.user.sendEmailVerification();

      document.getElementById("msg").style.color = "green";
      document.getElementById("msg").innerText =
        "Verification email sent. Please verify before login.";

      // 🔒 Force logout until verified
      await auth.signOut();
    })
    .catch(err => {
        if(err.message == "Firebase: Password should be at least 6 characters (auth/weak-password)."){
      document.getElementById("msg").innerText = "Password should be at least 6 characters ";}
    }); 
}

function login(email, password) {
    auth.signInWithEmailAndPassword(email, password)
        .then(async () => {
            document.getElementById("msg").style.color = "green";
            document.getElementById("msg").innerText = "Login successful!";   
            await fetch("/setLogin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
            });
            window.location.href = "/app";

        })
        .catch(err => {
            if(err.message == "Firebase: The supplied auth credential is incorrect, malformed or has expired. (auth/invalid-credential)."){
                document.getElementById("msg").innerText = "The email address or password you entered was incorrect";
            }

            if(err.message == "Firebase: A non-empty password must be provided (auth/missing-password)."){
                document.getElementById("msg").innerText = "password can't be blank";
            }
            

        });
}