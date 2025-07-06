// --- server.js 修正済みコード ---
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {}; // socket.id -> { name, score, isHost }
let nameMap = {}; // name -> socket.id
let currentQuestion = null;
let currentResponder = null;

io.on("connection", (socket) => {
  console.log("接続:", socket.id);

  socket.on("join", ({ name, isHost }) => {
    if (Object.values(players).some(p => p.name === name)) {
      socket.emit("join_error", { message: "この名前は既に使われています" });
      return;
    }

    const hostExists = Object.values(players).some(p => p.isHost);
    if (isHost && hostExists) {
      socket.emit("host_rejected");
      isHost = false;
    }

    players[socket.id] = { name, score: 0, isHost };
    nameMap[name] = socket.id;

    socket.emit("join_success", { host: isHost });
    io.emit("players", formatPlayers());
    updateHostDisplay();

    if (currentQuestion) socket.emit("question", currentQuestion);
  });

  socket.on("host_question", (q) => {
    currentQuestion = q;
    currentResponder = null;
    io.emit("question", q);
  });

  socket.on("buzz", () => {
    if (currentResponder) return; // すでに誰かが押している
    const player = players[socket.id];
    if (!player || player.isHost) return;

    currentResponder = socket.id;
    io.emit("buzzed", { name: player.name });
  });

  socket.on("answer", ({ index }) => {
    const player = players[socket.id];
    if (!player || !currentQuestion) return;
    if (currentResponder && socket.id !== currentResponder) return;

    const result = index === currentQuestion.correct ? "correct" : "wrong";
    if (result === "correct") {
      player.score += 1;
      io.emit("players", formatPlayers());
      io.emit("correct_answer_notification", player.name);
    }
    io.to(socket.id).emit("answer_result", { result });

    if (result === "wrong") {
      currentResponder = null;
      io.emit("reset_buzz");
    }
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      delete nameMap[players[socket.id].name];
    }
    delete players[socket.id];
    io.emit("players", formatPlayers());
    updateHostDisplay();
  });

  function updateHostDisplay() {
    const host = Object.values(players).find(p => p.isHost);
    io.emit("host_name", host ? host.name : null);
  }
});

function formatPlayers() {
  const out = {};
  Object.values(players).forEach((p) => {
    if (!p.isHost) out[p.name] = { score: p.score };
  });
  return out;
}

server.listen(3000, () => {
  console.log("クイズサーバー稼働中: http://localhost:3000");
});
