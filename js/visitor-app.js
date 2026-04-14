import { getFirebase } from "./firebase-client.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (id) => document.getElementById(id);

let auth;
let db;
let ownerAuthUid;
let unsubMsgs = null;

function showConfigError(code) {
  el("status").className = "status error";
  if (code === "MISSING_CONFIG") {
    el("status").textContent =
      "Thiếu js/firebase-config.js. Hãy sao chép từ firebase-config.example.js và điền thông tin Firebase.";
  } else if (code === "INVALID_OWNER_UID") {
    el("status").textContent =
      "Thiếu ownerAuthUid trong firebase-config.js (UID chủ trang, trùng Firestore Rules). Xem firebase-config.example.js.";
  } else {
    el("status").textContent =
      "Chưa điền đúng firebaseConfig (vẫn còn YOUR_...). Mở js/firebase-config.js và dán config từ Firebase Console.";
  }
  el("auth-panel").hidden = true;
  el("chat-panel").hidden = true;
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

function showAuthPanel(show) {
  el("auth-panel").hidden = !show;
  el("chat-panel").hidden = show;
}

function detachMessages() {
  if (unsubMsgs) {
    unsubMsgs();
    unsubMsgs = null;
  }
}

function renderMessageList(snap) {
  const box = el("messages");
  box.innerHTML = "";
  if (snap.empty) {
    box.innerHTML =
      '<p class="empty-state">Chưa có tin nhắn. Gửi lời chào — chủ trang sẽ thấy trong hộp thư.</p>';
    return;
  }
  const sorted = snap.docs.slice().sort((a, b) => {
    const ta = a.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
    const tb = b.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
    return ta - tb;
  });
  sorted.forEach((d) => {
    const m = d.data();
    const sender = m.sender === "owner" ? "owner" : "visitor";
    const div = document.createElement("div");
    div.className = `msg ${sender}`;
    div.textContent = m.text || "";
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const who = sender === "owner" ? "Chủ trang" : "Bạn";
    meta.textContent = who + " · " + (formatTime(m.createdAt) || "—");
    div.appendChild(meta);
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

function attachMessages(user) {
  detachMessages();
  const convId = user.uid;
  const msgsRef = collection(db, "owners", ownerAuthUid, "chats", convId, "messages");
  unsubMsgs = onSnapshot(
    msgsRef,
    (snap) => renderMessageList(snap),
    (err) => {
      el("status").className = "status error";
      el("status").textContent = "Lỗi tải tin nhắn: " + err.message;
    }
  );
}

function updateUserLabel(user) {
  const anon = user.isAnonymous;
  el("user-label").textContent = anon
    ? "Ẩn danh — lịch sử có thể mất nếu xóa dữ liệu trình duyệt"
    : (user.email || "Tài khoản") + " — lịch sử được lưu theo tài khoản";
  el("role-badge").textContent = anon ? "Ẩn danh" : "Đã đăng nhập";
}

async function main() {
  try {
    ({ auth, db, ownerAuthUid } = await getFirebase());
  } catch (e) {
    showConfigError(e.code);
    return;
  }

  showAuthPanel(true);
  el("status").className = "status";
  el("status").textContent =
    "Đăng ký / đăng nhập email để lưu lịch sử; hoặc chat ẩn danh (mỗi trình duyệt một hội thoại riêng).";
  el("send").disabled = true;
  el("input").disabled = true;

  const setAuthBusy = (busy, msg) => {
    el("btn-signup").disabled = busy;
    el("btn-signin").disabled = busy;
    el("btn-anon").disabled = busy;
    el("auth-email").disabled = busy;
    el("auth-password").disabled = busy;
    if (msg != null) {
      el("status").className = busy ? "status" : el("status").className;
      el("status").textContent = msg;
    }
  };

  const authErr = (e) => {
    el("status").className = "status error";
    el("status").textContent = e.message || String(e);
  };

  el("btn-signup").addEventListener("click", async () => {
    const email = el("auth-email").value.trim();
    const password = el("auth-password").value;
    if (!email || password.length < 6) {
      authErr(new Error("Nhập email và mật khẩu ít nhất 6 ký tự."));
      return;
    }
    setAuthBusy(true, "Đang tạo tài khoản…");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      authErr(e);
    } finally {
      setAuthBusy(false);
    }
  });

  el("btn-signin").addEventListener("click", async () => {
    const email = el("auth-email").value.trim();
    const password = el("auth-password").value;
    if (!email || !password) {
      authErr(new Error("Nhập email và mật khẩu."));
      return;
    }
    setAuthBusy(true, "Đang đăng nhập…");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      authErr(e);
    } finally {
      setAuthBusy(false);
    }
  });

  el("btn-anon").addEventListener("click", async () => {
    setAuthBusy(true, "Đang vào chế độ ẩn danh…");
    try {
      await signInAnonymously(auth);
    } catch (e) {
      authErr(e);
      el("status").textContent +=
        " — Trong Firebase Console, bật Authentication > Sign-in method > Anonymous.";
    } finally {
      setAuthBusy(false);
    }
  });

  el("btn-signout").addEventListener("click", () => signOut(auth));

  el("send").addEventListener("click", async () => {
    const text = el("input").value.trim();
    if (!text) return;
    const user = auth.currentUser;
    if (!user) return;
    const convId = user.uid;
    el("send").disabled = true;

    try {
      const inboxRef = doc(db, "owners", ownerAuthUid, "chats", convId);
      await setDoc(
        inboxRef,
        {
          updatedAt: serverTimestamp(),
          preview: text.slice(0, 120),
        },
        { merge: true }
      );

      await addDoc(collection(db, "owners", ownerAuthUid, "chats", convId, "messages"), {
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

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      detachMessages();
      showAuthPanel(true);
      el("status").className = "status";
      el("status").textContent =
        "Đăng ký / đăng nhập email để lưu lịch sử; hoặc chat ẩn danh.";
      el("send").disabled = true;
      el("input").disabled = true;
      return;
    }

    try {
      await user.getIdToken();
    } catch (e) {
      el("status").className = "status error";
      el("status").textContent = "Phiên đăng nhập lỗi: " + e.message;
      return;
    }

    showAuthPanel(false);
    el("send").disabled = false;
    el("input").disabled = false;
    el("status").className = "status";
    el("status").textContent =
      "Đã kết nối. Bạn thấy toàn bộ tin nhắn với chủ trang (theo tài khoản này).";
    updateUserLabel(user);
    attachMessages(user);
  });
}

main();
