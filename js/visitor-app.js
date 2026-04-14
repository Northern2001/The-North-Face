import { getFirebase } from "./firebase-client.js";
import {
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (id) => document.getElementById(id);

function showConfigError(code) {
  el("status").className = "status error";
  if (code === "MISSING_CONFIG") {
    el("status").textContent =
      "Thiếu js/firebase-config.js. Hãy sao chép từ firebase-config.example.js và điền thông tin Firebase.";
  } else {
    el("status").textContent =
      "Chưa điền đúng firebaseConfig (vẫn còn YOUR_...). Mở js/firebase-config.js và dán config từ Firebase Console.";
  }
  el("send").disabled = true;
  el("input").disabled = true;
}

function formatTime(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function main() {
  let auth;
  let db;

  try {
    ({ auth, db } = await getFirebase());
  } catch (e) {
    showConfigError(e.code);
    return;
  }

  el("status").textContent = "Đang kết nối…";

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    el("status").textContent = "Đã kết nối. Bạn chỉ thấy cuộc trò chuyện với chủ trang.";
    const convId = user.uid;
    const msgsRef = collection(db, "inbox", convId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"));

    onSnapshot(
      q,
      (snap) => {
        const box = el("messages");
        box.innerHTML = "";
        if (snap.empty) {
          box.innerHTML =
            '<p class="empty-state">Chưa có tin nhắn. Hãy gửi lời chào — chủ trang sẽ thấy trong hộp thư.</p>';
          return;
        }
        snap.forEach((d) => {
          const m = d.data();
          const div = document.createElement("div");
          const side = m.sender === "owner" ? "owner" : "visitor";
          div.className = `msg ${side}`;
          div.textContent = m.text || "";
          const meta = document.createElement("div");
          meta.className = "msg-meta";
          meta.textContent = formatTime(m.createdAt);
          div.appendChild(meta);
          box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
      },
      (err) => {
        el("status").className = "status error";
        el("status").textContent = "Lỗi tải tin nhắn: " + err.message;
      }
    );
  });

  try {
    await signInAnonymously(auth);
  } catch (e) {
    el("status").className = "status error";
    el("status").textContent =
      "Không đăng nhập ẩn danh được. Trong Firebase Console, bật Authentication > Sign-in method > Anonymous.";
    el("send").disabled = true;
    el("input").disabled = true;
    return;
  }

  el("send").addEventListener("click", async () => {
    const text = el("input").value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user) return;
    const convId = user.uid;
    el("send").disabled = true;

    try {
      const inboxRef = doc(db, "inbox", convId);
      await setDoc(
        inboxRef,
        {
          updatedAt: serverTimestamp(),
          preview: text.slice(0, 120),
        },
        { merge: true }
      );

      await addDoc(collection(db, "inbox", convId, "messages"), {
        text,
        sender: "visitor",
        createdAt: serverTimestamp(),
      });

      el("input").value = "";
    } catch (e) {
      el("status").className = "status error";
      el("status").textContent = "Gửi lỗi: " + e.message;
    } finally {
      el("send").disabled = false;
    }
  });

  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el("send").click();
    }
  });
}

main();
