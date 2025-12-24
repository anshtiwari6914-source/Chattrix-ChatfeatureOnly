// public/client.js (fixed)
const socket = io();
const startBtn = document.getElementById("startBtn");
const skipBtn = document.getElementById("skipBtn");
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


setInterval(() => {
  console.log("Viewport Height:", window.innerHeight);
}, 500);



let pendingCandidates = [];

let localStream;
let pc; // RTCPeerConnection
let currentPartner = null;
let roomId = null;


document.addEventListener("visibilitychange", () => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  videoTrack.enabled = !document.hidden;
});


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
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { max: 20 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (localVideo) localVideo.srcObject = localStream;
      startBtn.style.display = "none";
      skipBtn.style.display = "inline";
      toggleCamBtn.style.display = "inline";
      toggleMicBtn.style.display = "inline";
    } catch (e) {
      alert("Could not access camera/mic: " + e.message);
      throw e;
    }
  }
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

  if (localStream) {
    localStream.getTracks().forEach((t) => {
      pc.addTrack(t, localStream);
      console.log("➕ Track added:", t.kind);
    });
  }

  // 🔥 ADD THIS BLOCK RIGHT HERE
  const sender = pc.getSenders().find(s => s.track?.kind === "video");
  if (sender) {
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];

    params.encodings[0].maxBitrate = 400_000; // 400 kbps
    params.encodings[0].maxFramerate = 20;

    sender.setParameters(params);
  }

  pc.ontrack = (ev) => {
    console.log("🎥 Remote track received");
    remoteVideo.srcObject = ev.streams[0];
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      console.log("🧊 ICE candidate generated");
      socket.emit("signal", { type: "ice", candidate: ev.candidate });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("🧊 ICE state:", pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    console.log("🔗 PC state:", pc.connectionState);
  };
}


function cleanupPeer() {
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  if (remoteVideo) remoteVideo.srcObject = null;
}

function stopLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    if (localVideo) localVideo.srcObject = null;
  }
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
  setStatus("Connected to server. Click Start to join queue.");
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
  pretext.style.display="inline";
  showMessage("⚠️ Stranger skipped. Waiting for a new user...");
  setStatus("Partner disconnected. Waiting for a new partner...");
  currentPartner = null;
  roomId = null;
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
  pretext.style.display="inline";
  if (chatWindow) chatWindow.innerHTML = "";
  showMessage("⏭️ You skipped the user. Finding new one...");
  cleanupPeer();
  currentPartner = null;
  roomId = null;
  socket.emit("skip");
  socket.emit("join-queue");
});


leaveBtn.addEventListener("click", () => {
  // disconnect socket to leave
  socket.disconnect();
  setStatus("Left. Refresh to reconnect.");
  startBtn.disabled = false;
  if (skipBtn) skipBtn.disabled = true;
  if (leaveBtn) leaveBtn.disabled = true;
  cleanupPeer();
  stopLocalStream();
});

// camera toggle
let camHidden = false;
toggleCamBtn.addEventListener("click", () => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  camHidden = !camHidden;
  videoTrack.enabled = !camHidden;
  toggleCamBtn.textContent = camHidden ? "Show Cam" : "Hide Camera";
  if (localVideo) localVideo.style.background = camHidden ? "#000" : "#000";

  
});

// mic toggle
let micMuted = false;
toggleMicBtn.addEventListener("click", () => {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  micMuted = !micMuted;
  audioTrack.enabled = !micMuted;
  toggleMicBtn.textContent = micMuted ? "Unmute" : "Mute";
});