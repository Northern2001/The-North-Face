import { getFirebase } from "./firebase-client.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (id) => document.getElementById(id);

let unsubscribeInbox = null;
let unsubscribeMsgs = null;
let activeConvId = null;

function showConfigError(code) {
  el("status").className = "status error";
  if (code === "MISSING_CONFIG") {
    el("status").textContent =
      "Thiếu js/firebase-config.js. Sao chép từ firebase-config.example.js và điền config.";
  } else {
    el("status").textContent = "firebase-config.js chưa hợp lệ (còn YOUR_...).";
  }
  el("login-panel").style.display = "none";
}

function formatTime(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clearThreadListeners() {
  if (unsubscribeMsgs) {
    unsubscribeMsgs();
    unsubscribeMsgs = null;
  }
}

function renderMessages(db, convId) {
  clearThreadListeners();
  const box = el("thread-messages");
  box.innerHTML = '<p class="empty-state">Đang tải…</p>';

  const msgsRef = collection(db, "inbox", convId, "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"));

  unsubscribeMsgs = onSnapshot(
    q,
    (snap) => {
      box.innerHTML = "";
      if (snap.empty) {
        box.innerHTML = '<p class="empty-state">Chưa có tin nhắn.</p>';
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
        meta.textContent =
          (m.sender === "owner" ? "Bạn" : "Khách") + " · " + formatTime(m.createdAt);
        div.appendChild(meta);
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    },
    (err) => {
      box.innerHTML =
        '<p class="status error">Lỗi: ' + err.message + "</p>";
    }
  );
}

function selectConversation(db, convId, itemsEl) {
  activeConvId = convId;
  itemsEl.querySelectorAll(".thread-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.conv === convId);
  });
  el("active-label").textContent = "Khách: " + convId.slice(0, 10) + "…";
  el("composer-wrap").style.display = "flex";
  renderMessages(db, convId);
}

function bindInbox(db) {
  if (unsubscribeInbox) unsubscribeInbox();
  const itemsEl = el("thread-items");
  const inboxCol = query(collection(db, "inbox"), orderBy("updatedAt", "desc"));

  unsubscribeInbox = onSnapshot(
    inboxCol,
    (snap) => {
      itemsEl.innerHTML = "";
      if (snap.empty) {
        itemsEl.innerHTML = '<p class="empty-state">Chưa có ai nhắn.</p>';
        clearThreadListeners();
        el("thread-messages").innerHTML =
          '<p class="empty-state">Chọn một cuộc trò chuyện bên trái.</p>';
        el("composer-wrap").style.display = "none";
        return;
      }

      snap.forEach((d) => {
        const convId = d.id;
        const data = d.data();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thread-item";
        btn.dataset.conv = convId;

        const idLine = document.createElement("div");
        idLine.className = "thread-id";
        idLine.textContent = convId;

        const preview = document.createElement("div");
        preview.className = "thread-preview";
        preview.textContent = data.preview || "";

        const timeLine = document.createElement("div");
        timeLine.className = "thread-preview";
        timeLine.textContent = formatTime(data.updatedAt);

        btn.appendChild(idLine);
        btn.appendChild(preview);
        btn.appendChild(timeLine);
        btn.addEventListener("click", () => selectConversation(db, convId, itemsEl));
        itemsEl.appendChild(btn);
      });

      if (activeConvId && snap.docs.some((d) => d.id === activeConvId)) {
        selectConversation(db, activeConvId, itemsEl);
      } else if (snap.docs[0]) {
        selectConversation(db, snap.docs[0].id, itemsEl);
      }
    },
    (err) => {
      itemsEl.innerHTML =
        '<p class="status error">Không đọc được inbox. Kiểm tra Firestore Rules và index: ' +
        err.message +
        "</p>";
    }
  );
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

  el("status").textContent = "";

  el("btn-login").addEventListener("click", async () => {
    const email = el("email").value.trim();
    const password = el("password").value;
    el("status").className = "status";
    el("status").textContent = "Đang đăng nhập…";
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      el("status").className = "status error";
      el("status").textContent = e.message;
    }
  });

  el("btn-logout").addEventListener("click", () => signOut(auth));

  el("btn-send").addEventListener("click", async () => {
    const text = el("reply").value.trim();
    if (!text || !activeConvId) return;
    el("btn-send").disabled = true;
    try {
      const inboxRef = doc(db, "inbox", activeConvId);
      await addDoc(collection(db, "inbox", activeConvId, "messages"), {
        text,
        sender: "owner",
        createdAt: serverTimestamp(),
      });
      await updateDoc(inboxRef, {
        updatedAt: serverTimestamp(),
        preview: text.slice(0, 120),
      });
      el("reply").value = "";
    } catch (e) {
      el("status").className = "status error";
      el("status").textContent = "Gửi lỗi: " + e.message;
    } finally {
      el("btn-send").disabled = false;
    }
  });

  el("reply").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el("btn-send").click();
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await user.getIdToken();
      } catch (e) {
        el("status").className = "status error";
        el("status").textContent = "Phiên đăng nhập lỗi: " + e.message;
        return;
      }
      el("login-panel").style.display = "none";
      el("owner-ui").style.display = "flex";
      el("status").textContent = "Đã đăng nhập: " + user.email;
      bindInbox(db);
    } else {
      if (unsubscribeInbox) {
        unsubscribeInbox();
        unsubscribeInbox = null;
      }
      clearThreadListeners();
      activeConvId = null;
      el("login-panel").style.display = "block";
      el("owner-ui").style.display = "none";
      el("status").textContent = "";
    }
  });
}

main();
