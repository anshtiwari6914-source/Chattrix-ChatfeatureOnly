const socket = io({
  query: { admin: "true" }
});

// DOM
const onlineUsers = document.getElementById("onlineUsers");
const activeChats = document.getElementById("activeChats");
const reports = document.getElementById("reports");

// Receive stats from server
socket.on("admin-stats", (data) => {
  onlineUsers.textContent = data.online;
  activeChats.textContent = data.chats;
  reports.textContent = data.reports;
});

// Live log stream
socket.on("admin-log", (msg) => {
  const stream = document.querySelector(".stream");
  const p = document.createElement("p");
  p.textContent = msg;
  stream.prepend(p);
});


// progress bar 

const slider = document.getElementById("progressSlider");
const valueText = document.getElementById("progressValue");

// receive current value
socket.on("progress-update", ({ count, target }) => {
  slider.value = count;
  slider.max = target;
  valueText.textContent = count;
});

// admin moves slider
slider.addEventListener("input", () => {
  const newValue = Number(slider.value);
  valueText.textContent = newValue;

  socket.emit("admin-update-progress", newValue);
});
