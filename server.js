// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const cookieParser = require("cookie-parser");
const path = require("path");


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
    }

  }, 3000); // 3 seconds delay
}



function unpairSocket(socketId) {
  const partnerId = pairs.get(socketId);
  if (!partnerId) return null;

  pairs.delete(socketId);
  pairs.delete(partnerId);

  // 🔔 Notify BOTH users
  io.to(socketId).emit("partner-left");
  io.to(partnerId).emit("partner-left");

  return partnerId;
}


io.on("connection", (socket) => {

  io.emit("online-count", io.engine.clientsCount);

  socket.on("pairing-started", () => {
  showMessage("🔄 Connecting to stranger...");
  setStatus("Connecting...");
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
    const index = waitingQueue.indexOf(socket.id);
    if (index !== -1) waitingQueue.splice(index, 1);

    const partner = unpairSocket(socket.id);
    if (partner && !waitingQueue.includes(partner)) waitingQueue.push(partner);
    io.emit("online-count", io.engine.clientsCount);
  });

});

// ---------------- START SERVER ----------------
server.listen(3000, () => {
  console.log("Server running → http://localhost:3000");
});




