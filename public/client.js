// public/client.js (fixed)

const socket = io();
const startBtn = document.getElementById("startBtn");
const skipBtn = document.getElementById("skipBtn");
const reportBtn = document.getElementById("report");
const crushBtn = document.getElementById("crush");
const leaveBtn = document.getElementById("leaveBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("myVideo");
const remoteVideo = document.getElementById("peerVideo");
const chatWindow = document.getElementById("chatWindow");
const chatMsg = document.getElementById("chatMsg");
const sendBtn = document.getElementById("sendBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const onlineCount = document.getElementById("onlineCount");
const pretext = document.getElementById("pretext");

crushBtn.disabled = true;




let pendingCandidates = [];

let pc; // RTCPeerConnection
let currentPartner = null;
let roomId = null;



const systemMessage = document.getElementById("systemMessage");

function showMessage(msg) {
  systemMessage.textContent = msg;
}



history.pushState(null, null, location.href);
window.onpopstate = () => history.go(1);

// // Prevent multiple tabs
// if (localStorage.getItem("app-opened") === "true") {
//   alert("This app is already open in another tab.");
//   // Try to close new tab (may not work in all browsers)
//   window.close();
//   // Fallback: redirect to a safe page
//   window.location.href = "about:blank";
// }

// // Mark this tab as opened
// localStorage.setItem("app-opened", "true");

// // When tab closes or reloads, remove the flag
// window.addEventListener("beforeunload", () => {
//   localStorage.removeItem("app-opened");
// });

// Basic STUN servers. For production add a TURN server.
const pcConfig = {
  iceServers: [
    {
      urls: [
        "turn:global.relay.metered.ca:443?transport=udp",
        "turn:global.relay.metered.ca:443?transport=tcp"
      ],
      username: "50a7373e20e54e0d3c797769",
      credential: "NrHG6iOFdYzgBI9j"
    }
  ]
};




function setStatus(s) {
  if (statusEl) statusEl.textContent = s;
}

async function startLocal() {
  startBtn.style.display = "none";
  skipBtn.style.display = "inline";
  reportBtn.style.display = "inline";
  crushBtn.style.display = "inline";
}

function createPeerConnection() {
  pc = new RTCPeerConnection({
  iceServers: pcConfig.iceServers,
  iceTransportPolicy: "relay"
});

pc.addTransceiver("video", {
  direction: "sendrecv",
  sendEncodings: [{ maxBitrate: 400_000 }]
});


  console.log("🧠 PeerConnection created");

}


function cleanupPeer() {
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  if (remoteVideo) remoteVideo.srcObject = null;
}


// Chat UI helper
function appendChat(msg, self = false) {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.margin = "8px 0";
  wrap.style.alignItems = self ? "flex-end" : "flex-start";

  const title = document.createElement("div");
  title.textContent = self ? "You" : "Stranger";
  title.style.fontSize = "12px";
  title.style.marginBottom = "2px";
  title.style.color = self ? "#0284c7" : "#92400e";
  title.style.fontWeight = "600";

  const bubble = document.createElement("div");
  bubble.textContent = msg;
  bubble.style.padding = "10px 14px";
  bubble.style.borderRadius = "12px";
  bubble.style.maxWidth = "65%";
  bubble.style.background = self ? "#d1f0ff" : "#ffe8cc";
  bubble.style.color = "#111";
  bubble.style.fontSize = "15px";
  bubble.style.lineHeight = "1.3";
  bubble.style.boxShadow = "0 2px 5px rgba(0,0,0,0.08)";

  wrap.appendChild(title);
  wrap.appendChild(bubble);

  if (chatWindow) {
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

// ---------- Socket handlers ----------




socket.on("connect", () => {
  socket.emit("ping-test");
// testing
  console.log("✅ Socket connected:", socket.id);
  setStatus("Connected to server. Click Start to join queue.");
});

socket.on("disconnect", () => {
  console.log("❌ Socket disconnected");
});

socket.on("online-count", (count) => {
  if (onlineCount) onlineCount.textContent = "People Online: " + count;
});

socket.on("waiting", () => {
  showMessage("⏳ Waiting for a stranger...");
  setStatus("Waiting for a partner...");
  if (skipBtn) skipBtn.disabled = false;
  if (leaveBtn) leaveBtn.disabled = false;
});

socket.on("paired", async ({ room, partner }) => {
  currentPartner = partner;

  crushBtn.disabled = false;
  crushBtn.textContent = "💖 Crush";

  if (chatWindow) chatWindow.innerHTML = "";
  roomId = room;
  currentPartner = partner;
  showMessage("✅ Stranger connected!");
  skipBtn.disabled = false;
  setStatus("Paired! Establishing connection...");

  // Enable send button now
  sendBtn.disabled = false;


  if (skipBtn) skipBtn.disabled = false;
  if (leaveBtn) leaveBtn.disabled = false;

  // Prepare local media & peer connection
  await startLocal();
  createPeerConnection();

  // Decide who makes the offer to avoid collisions
  const shouldOffer = socket.id < partner;
  if (shouldOffer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { type: "offer", sdp: offer });
  }
});

socket.on("partner-left", () => {
  crushBtn.disabled = false;
  crushBtn.textContent = "💖 Crush";
  pretext.style.display="inline";
  showMessage("⚠️ Stranger skipped. Waiting for a new user...");
  setStatus("Partner disconnected. Waiting for a new partner...");
  currentPartner = null;
  roomId = null;
  if (chatWindow) chatWindow.innerHTML = "";
  cleanupPeer();

  sendBtn.disabled = true;
});

// signaling messages from server forwarded from partner
socket.on("signal", async ({ from, data }) => {
  if (!pc && data.type !== "offer") {
    await startLocal();
    createPeerConnection();
  }

  if (data.type === "offer") {
    // ✅ set remote offer
    await pc.setRemoteDescription(data.sdp);

    // ✅ add any ICE that arrived early
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(c);
    }
    pendingCandidates = [];

    // ✅ create & send answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { type: "answer", sdp: answer });

  } else if (data.type === "answer") {
    // ✅ set remote answer
    await pc.setRemoteDescription(data.sdp);

    // ✅ add any ICE that arrived early
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(c);
    }
    pendingCandidates = [];

  } else if (data.type === "ice") {
    // ✅ ICE may arrive before SDP
    if (pc.remoteDescription) {
      await pc.addIceCandidate(data.candidate);
    } else {
      pendingCandidates.push(data.candidate);
    }
  }
});



socket.on("chat-message", ({ msg }) => {
  appendChat(msg, false);
  pretext.style.display="none";
});

socket.on("crush-match", () => {
  alert("💘 It's a MATCH!");
  showMessage("💘 You both crushed each other!");
});


socket.on("pairing-started", () => {
  let count = 3;
  showMessage(`🔄 Connecting... ${count}`);
  skipBtn.disabled = true;
  const timer = setInterval(() => {
    count--;
    if (count === 0) {
      clearInterval(timer);
    } else {
      showMessage(`🔄 Connecting... ${count}`);
    }
  }, 1000);
});

socket.on("progress-update", ({ count, target }) => {
  const percent = Math.min((count / target) * 100, 100);

  document.querySelector(".progress-fill").style.width = percent + "%";
  document.querySelector(".progress-text").textContent =
    `${count} / ${target}`;
});

socket.on("system-alert", (msg) => {
  alert(msg);
});


// ---------- Buttons ----------
startBtn.addEventListener("click", async () => {
  
  await startLocal();
  socket.emit("join-queue");
  setStatus("Joining queue...");
  if (skipBtn) skipBtn.disabled = false;
  if (leaveBtn) leaveBtn.disabled = false;
});

sendBtn.addEventListener("click", () => {
  const text = chatMsg.value.trim();
  pretext.style.display="none";
  if (!text || !currentPartner) return;

  appendChat(text, true);
  socket.emit("chat-message", text);
  chatMsg.value = "";
});

chatMsg.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

skipBtn.addEventListener("click", () => {
  crushBtn.disabled = false;
  crushBtn.textContent = "💖 Crush";

  pretext.style.display="inline";
  if (chatWindow) chatWindow.innerHTML = "";
  showMessage("⏭️ You skipped the user. Finding new one...");
  cleanupPeer();
  currentPartner = null;
  roomId = null;
  socket.emit("skip");
  socket.emit("join-queue");
});

crushBtn.addEventListener("click", () => {
  console.log("💖 Crush button clicked");
  
  if (!currentPartner) {
    console.log("❌ No currentPartner on client");
    return;
  }

  socket.emit("send-crush");
  console.log("📤 send-crush emitted");

  crushBtn.disabled = true;
  crushBtn.textContent = "💖 Sent";
});

reportBtn.addEventListener("click", () => {
  socket.emit("report-user");
  alert("User reported & skipped");
});
