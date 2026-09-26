const path = require("path");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = require("http").createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// room state, keyed by room id
// { videoId, isPlaying, time, updatedAt, users: Map<socketId, name> }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      videoId: null,
      isPlaying: false,
      time: 0,
      updatedAt: Date.now(),
      users: new Map(),
    });
  }
  return rooms.get(roomId);
}

function estimatedTime(room) {
  if (!room.isPlaying) return room.time;
  return room.time + (Date.now() - room.updatedAt) / 1000;
}

function userList(room) {
  return Array.from(room.users.values());
}

io.on("connection", (socket) => {
  let joinedRoom = null;

  socket.on("join", ({ roomId, name }) => {
    if (!roomId) return;
    joinedRoom = roomId;
    const room = getRoom(roomId);
    room.users.set(socket.id, name || "Anonym");
    socket.join(roomId);

    socket.emit("state", {
      videoId: room.videoId,
      isPlaying: room.isPlaying,
      time: estimatedTime(room),
      users: userList(room),
    });

    socket.to(roomId).emit("users", userList(room));
    socket.to(roomId).emit("chat", {
      system: true,
      text: `${name || "Anonym"} ist beigetreten.`,
    });
  });

  socket.on("load-video", ({ roomId, videoId }) => {
    const room = getRoom(roomId);
    room.videoId = videoId;
    room.isPlaying = false;
    room.time = 0;
    room.updatedAt = Date.now();
    io.to(roomId).emit("load-video", { videoId });
  });

  socket.on("play", ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.isPlaying = true;
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(roomId).emit("play", { time });
  });

  socket.on("pause", ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.isPlaying = false;
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(roomId).emit("pause", { time });
  });

  socket.on("seek", ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(roomId).emit("seek", { time });
  });

  socket.on("chat", ({ roomId, name, text }) => {
    if (!text || !text.trim()) return;
    io.to(roomId).emit("chat", { name: name || "Anonym", text: text.trim() });
  });

  socket.on("disconnect", () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    const name = room.users.get(socket.id);
    room.users.delete(socket.id);
    io.to(joinedRoom).emit("users", userList(room));
    if (name) {
      io.to(joinedRoom).emit("chat", {
        system: true,
        text: `${name} hat den Raum verlassen.`,
      });
    }
    if (room.users.size === 0) {
      rooms.delete(joinedRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Watch Together läuft auf http://localhost:${PORT}`);
});
