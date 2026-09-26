const socket = io();

let roomId = null;
let userName = null;
let player = null;
let playerReady = false;
let pendingVideoId = null;
let applyingRemoteChange = false;
let syncTimer = null;

const joinScreen = document.getElementById("join-screen");
const roomScreen = document.getElementById("room-screen");
const nameInput = document.getElementById("name-input");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const createBtn = document.getElementById("create-btn");
const roomTitle = document.getElementById("room-title");
const userListEl = document.getElementById("user-list");
const copyLinkBtn = document.getElementById("copy-link-btn");
const videoForm = document.getElementById("video-form");
const videoInput = document.getElementById("video-input");
const playerPlaceholder = document.getElementById("player-placeholder");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 8);
}

function extractVideoId(input) {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1);
    }
    if (url.searchParams.has("v")) {
      return url.searchParams.get("v");
    }
    const shortsMatch = url.pathname.match(/\/shorts\/([\w-]{11})/);
    if (shortsMatch) return shortsMatch[1];
  } catch (e) {
    return null;
  }
  return null;
}

function enterRoom(id) {
  roomId = id;
  userName = nameInput.value.trim() || "Anonym";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url);

  joinScreen.classList.add("hidden");
  roomScreen.classList.remove("hidden");
  roomTitle.textContent = `Raum: ${roomId}`;

  socket.emit("join", { roomId, name: userName });
}

joinBtn.addEventListener("click", () => {
  const id = roomInput.value.trim();
  if (!id) {
    roomInput.focus();
    return;
  }
  enterRoom(id);
});

createBtn.addEventListener("click", () => {
  enterRoom(randomRoomCode());
});

copyLinkBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    copyLinkBtn.textContent = "✅ Kopiert!";
    setTimeout(() => (copyLinkBtn.textContent = "🔗 Link kopieren"), 1500);
  });
});

// YouTube IFrame API
function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height: "100%",
    width: "100%",
    playerVars: { playsinline: 1 },
    events: {
      onReady: () => {
        playerReady = true;
        if (pendingVideoId) {
          player.loadVideoById(pendingVideoId);
          pendingVideoId = null;
        }
      },
      onStateChange: onPlayerStateChange,
    },
  });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function onPlayerStateChange(event) {
  if (applyingRemoteChange) return;
  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit("play", { roomId, time: player.getCurrentTime() });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("pause", { roomId, time: player.getCurrentTime() });
  }
}

function loadVideo(videoId) {
  playerPlaceholder.classList.add("hidden");
  if (playerReady) {
    player.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

videoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const videoId = extractVideoId(videoInput.value);
  if (!videoId) {
    videoInput.focus();
    return;
  }
  socket.emit("load-video", { roomId, videoId });
  videoInput.value = "";
});

// periodically re-sync in case of drift while playing
function withRemoteFlag(fn) {
  applyingRemoteChange = true;
  fn();
  setTimeout(() => (applyingRemoteChange = false), 500);
}

socket.on("state", ({ videoId, isPlaying, time, users }) => {
  renderUsers(users);
  if (videoId) {
    loadVideo(videoId);
    const applyState = () => {
      withRemoteFlag(() => {
        player.seekTo(time, true);
        if (isPlaying) player.playVideo();
        else player.pauseVideo();
      });
    };
    if (playerReady) applyState();
    else {
      const check = setInterval(() => {
        if (playerReady) {
          clearInterval(check);
          applyState();
        }
      }, 200);
    }
  }
});

socket.on("load-video", ({ videoId }) => {
  loadVideo(videoId);
});

socket.on("play", ({ time }) => {
  withRemoteFlag(() => {
    if (Math.abs(player.getCurrentTime() - time) > 1) player.seekTo(time, true);
    player.playVideo();
  });
});

socket.on("pause", ({ time }) => {
  withRemoteFlag(() => {
    player.seekTo(time, true);
    player.pauseVideo();
  });
});

socket.on("seek", ({ time }) => {
  withRemoteFlag(() => {
    player.seekTo(time, true);
  });
});

socket.on("users", renderUsers);

function renderUsers(users) {
  userListEl.textContent = `👥 ${users.join(", ")}`;
}

socket.on("chat", ({ name, text, system }) => {
  const div = document.createElement("div");
  div.classList.add("msg");
  if (system) {
    div.classList.add("system");
    div.textContent = text;
  } else {
    div.innerHTML = `<span class="author">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat", { roomId, name: userName, text });
  chatInput.value = "";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// auto-join if room param present in URL
const params = new URLSearchParams(window.location.search);
if (params.has("room")) {
  roomInput.value = params.get("room");
}
