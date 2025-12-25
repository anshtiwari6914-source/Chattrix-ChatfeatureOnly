// server.js
let adminSockets = new Set();
let reportsCount = 0;
let progressCount = 0;
const PROGRESS_TARGET = 10000;


const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const cookieParser = require("cookie-parser");
const path = require("path");

// 💖 Crush storage
const crushes = new Map(); // socketId -> Set(partnerSocketId)


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(cookieParser());

// ---------------- ONE-TIME SESSION STORAGE ----------------
let activeSessions = new Set();

// ---------------- LOGIN PAGES ----------------
app.use("/auth", express.static(path.join(__dirname, "auth")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "auth", "login.html"));
});

// Create session cookie when login is successful
app.post("/setLogin", (req, res) => {
  const sessionId = randomUUID();     // unique token
  activeSessions.add(sessionId);      // store in memory

  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    sameSite: "Strict"
  });

  res.json({ ok: true });
});

// ---------------- LOGIN CHECK ----------------
function requireLogin(req, res, next) {
  const sessionId = req.cookies.sessionId;

  if (!sessionId) return res.redirect("/");

  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);  // one-time use
    return next();
  }

  // if token missing OR already used → no access
  return res.redirect("/");
}

// ✅ ADMIN PANEL (STATIC ONLY)
app.use("/muthbazAdmin", express.static(path.join(__dirname, "admin"), {
  index: "adminDash.html"
}));


// ---------------- PROTECTED APP ----------------
app.use(express.static(path.join(__dirname, "public")));

app.get("/app", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- SOCKET.IO ----------------
const waitingQueue = [];
const pairs = new Map();

function pairSockets(aId, bId) {
  const room = randomUUID();

  // store pairing immediately
  pairs.set(aId, bId);
  pairs.set(bId, aId);

  // notify users that pairing has started (optional)
  io.to(aId).emit("pairing-started");
  io.to(bId).emit("pairing-started");

  // ⏱️ delay actual connection
  setTimeout(() => {

    // SAFETY CHECK (very important)
    if (pairs.get(aId) === bId && pairs.get(bId) === aId) {
      io.to(aId).emit("paired", { room, partner: bId });
      io.to(bId).emit("paired", { room, partner: aId });
      emitAdminStats();

    }

  }, 3000); // 3 seconds delay
}



function unpairSocket(socketId) {
  const partnerId = pairs.get(socketId);
  if (!partnerId) return null;

  clearCrush(socketId, partnerId);

  pairs.delete(socketId);
  pairs.delete(partnerId);

  io.to(socketId).emit("partner-left");
  io.to(partnerId).emit("partner-left");

  return partnerId;
}


io.on("connection", (socket) => {


  // ---------------------------
  // SEND CURRENT COUNT TO CLIENT
  // ---------------------------
  socket.emit("progress-update", {
    count: progressCount,
    target: PROGRESS_TARGET
  });

  // ---------------------------
  // ADMIN CHANGES SLIDER
  // ---------------------------
  socket.on("admin-update-progress", (newCount) => {
    progressCount = Math.min(newCount, PROGRESS_TARGET);

    // BROADCAST TO ALL USERS
    io.emit("progress-update", {
      count: progressCount,
      target: PROGRESS_TARGET
    });
  });



  
// Admin detected
if (socket.handshake.query.admin === "true") {
  adminSockets.add(socket.id);
  emitAdminStats(); // 👈 user connected
  console.log("🛡️ Admin connected");
  socket.on("disconnect", () => {
    adminSockets.delete(socket.id);
    emitAdminStats(); // 👈 user connected

  });

  // Send stats immediately
  socket.emit("admin-stats", {
    online: io.engine.clientsCount,
    chats: pairs.size / 2,
    reports: reportsCount
  });

  return; // ⛔ admin does NOT join chat logic
}
emitAdminStats(); // 👈 user connected


socket.on("ping-test", () => {
  console.log("🔌 New socket connected:", socket.id);
  console.log("🏓 Ping received from", socket.id);
});

socket.on("send-crush", () => {
  const sender = socket.id;
  const partner = pairs.get(sender);

  console.log("💖 Crush clicked by:", sender);
  console.log("👉 Partner:", partner);

  if (!partner) {
    console.log("❌ No partner found");
    return;
  }

  if (!crushes.has(sender)) {
    crushes.set(sender, new Set());
  }

  crushes.get(sender).add(partner);

  console.log("📦 Crushes:", crushes);

  if (crushes.has(partner) && crushes.get(partner).has(sender)) {
    console.log("💘 MUTUAL CRUSH");
    io.to(sender).emit("crush-match");
    io.to(partner).emit("crush-match");
  }
});


  io.emit("online-count", io.engine.clientsCount);

  //   socket.on("pairing-started", () => {
  //   showMessage("🔄 Connecting to stranger...");
  //   setStatus("Connecting...");
  // });


  socket.on("report-user", () => {
  const reporter = socket.id;
  const reported = pairs.get(reporter);

  if (!reported) return;



  reportsCount++;
  emitAdminStats();

  adminSockets.forEach(id => {
    io.to(id).emit("admin-log", "🚨 User reported");
  });
  socket.emit("partner-left");
  // 1️⃣ alert both users
  io.to(reporter).emit("system-alert", "⚠️ You reported this user. Skipping...");
  io.to(reported).emit("system-alert", "⚠️ You have been reported. Connection ended.");

  // 2️⃣ unpair
  pairs.delete(reporter);
  pairs.delete(reported);

  // 3️⃣ notify partner left
  io.to(reported).emit("partner-left");
  io.to(reporter).emit("partner-left");

  // 4️⃣ put reporter back in queue
  waitingQueue.push(reporter);
  io.to(reporter).emit("waiting");
});
  socket.on("join-queue", () => {
    if (pairs.has(socket.id)) return;
    if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);

    if (waitingQueue.length >= 2) {
      const a = waitingQueue.shift();
      const b = waitingQueue.shift();
      if (a !== b) pairSockets(a, b);
    } else {
      socket.emit("waiting");
    }
  });
  socket.on("signal", (data) => {
    const partner = pairs.get(socket.id);
    if (partner) io.to(partner).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", (msg) => {
    const partner = pairs.get(socket.id);
    if (partner) io.to(partner).emit("chat-message", { msg });
  });

  socket.on("skip", () => {
    emitAdminStats(); // 👈 user connected

  const partnerId = unpairSocket(socket.id);

  // Put current user back in queue
  if (!waitingQueue.includes(socket.id)) {
    waitingQueue.push(socket.id);
    socket.emit("waiting");
  }

  // Put partner back in queue
  if (partnerId && !waitingQueue.includes(partnerId)) {
    waitingQueue.push(partnerId);
    io.to(partnerId).emit("waiting");
  }

  // 🔥 IMPORTANT: Try pairing again
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();

    if (a && b && a !== b) {
      pairSockets(a, b);
    } else {
      if (a) waitingQueue.unshift(a);
      if (b) waitingQueue.unshift(b);
      break;
    }
  }
});



 socket.on("disconnect", () => {
  const partner = unpairSocket(socket.id);

  const index = waitingQueue.indexOf(socket.id);
  if (index !== -1) waitingQueue.splice(index, 1);

  if (partner && !waitingQueue.includes(partner)) {
    waitingQueue.push(partner);
    io.to(partner).emit("waiting");
  }

  io.emit("online-count", io.engine.clientsCount);
});


});


function clearCrush(a, b) {
  if (crushes.has(a)) crushes.get(a).delete(b);
  if (crushes.has(b)) crushes.get(b).delete(a);
}

function emitAdminStats() {
  const data = {
    online: io.engine.clientsCount,
    chats: pairs.size / 2,
    reports: reportsCount
  };
  console.log("📊 ADMIN STATS EMITTED:", data); // 👈 ADD THIS

  adminSockets.forEach(id => {
    io.to(id).emit("admin-stats", data);
  });
}


// ---------------- START SERVER ----------------
server.listen(3000, () => {
  console.log("Server running → http://localhost:3000");
});


