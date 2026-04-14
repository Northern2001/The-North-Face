import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let app;
let auth;
let db;

export async function getFirebase() {
  if (app) return { app, auth, db };

  let mod;
  try {
    mod = await import("./firebase-config.js");
  } catch {
    const err = new Error("MISSING_CONFIG");
    err.code = "MISSING_CONFIG";
    throw err;
  }

  const { firebaseConfig } = mod;
  if (
    !firebaseConfig?.apiKey ||
    firebaseConfig.apiKey.startsWith("YOUR_") ||
    firebaseConfig.projectId?.startsWith("YOUR_")
  ) {
    const err = new Error("INVALID_CONFIG");
    err.code = "INVALID_CONFIG";
    throw err;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return { app, auth, db };
}
