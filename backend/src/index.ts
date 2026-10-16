import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`[backend] client connected: ${socket.id}`);

  // Ping/pong stub for future authoritative tick (Phase 3: 10-20Hz loop).
  // Client emits "ping", server replies "pong" with server timestamp.
  socket.on("ping", (payload?: unknown) => {
    socket.emit("pong", {
      received: payload ?? null,
      serverTime: Date.now(),
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[backend] client disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});
