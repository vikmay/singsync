const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const next = require("next");
const crypto = require("crypto");
const qrcode = require("qrcode");
const os = require("os");
const path = require("path");

const {
    initDb,
    listSongs,
    getSongById,
    ensureMigrations,
    createRoom,
    getRoom,
    addSong,
    updateSong,
    deleteSong,
} = require("./sqlite");

const { registerSocketHandlers } = require("./socket");
const {
    getRoomStateSnapshot,
    setLeader,
    setSong,
} = require("./roomState");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH || "database.sqlite";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
    await ensureMigrations(DB_PATH);
    initDb(DB_PATH);

    const app = express();
    app.use(express.json({ limit: "1mb" }));

    const server = http.createServer(app);

    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE"],
        },
    });

    registerSocketHandlers(io, {
        getRoomStateSnapshot,
    });

    const nextApp = next({
        dev,
        port: PORT,
        // Ensure Next uses the correct app root (singsync/)
        dir: path.join(__dirname, ".."),
    });

    const handle = nextApp.getRequestHandler();

    nextApp
        .prepare()
        .then(() => {
            app.get("/healthz", (req, res) => res.json({ ok: true }));

            // Songs APIs
            app.get("/api/songs", (req, res) => {
                const q = typeof req.query.q === "string" ? req.query.q : "";
                const songs = listSongs({ query: q });
                res.json({ songs });
            });

            app.get("/api/song/:id", (req, res) => {
                const song = getSongById(req.params.id);
                if (!song) return res.status(404).json({ error: "Song not found" });
                res.json({ song });
            });

            // POST /api/songs { title: string, artist: string, lines: Array<{chords: string, text: string}> }
            app.post("/api/songs", (req, res) => {
                try {
                    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
                    const artist = typeof req.body?.artist === "string" ? req.body.artist.trim() : "";
                    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

                    if (!title) return res.status(400).json({ error: "title is required" });
                    if (!artist) return res.status(400).json({ error: "artist is required" });
                    if (lines.length === 0) return res.status(400).json({ error: "lines are required" });

                    const content = JSON.stringify({
                        version: 1,
                        lines,
                    });

                    addSong({ title, artist, content });

                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to add song" });
                }
            });

            // PUT /api/song/:id
            app.put("/api/song/:id", (req, res) => {
                try {
                    const id = req.params.id;
                    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
                    const artist = typeof req.body?.artist === "string" ? req.body.artist.trim() : "";
                    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

                    if (!title) return res.status(400).json({ error: "title is required" });
                    if (!artist) return res.status(400).json({ error: "artist is required" });
                    if (lines.length === 0) return res.status(400).json({ error: "lines are required" });

                    const content = JSON.stringify({
                        version: 1,
                        lines,
                    });

                    updateSong({ id, title, artist, content });
                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to update song" });
                }
            });

            // DELETE /api/song/:id
            app.delete("/api/song/:id", (req, res) => {
                try {
                    deleteSong(req.params.id);
                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to delete song" });
                }
            });

            // Rooms APIs
            // POST /api/room  { roomId?: string, songId: number, leaderId: string }
            app.post("/api/room", (req, res) => {
                try {
                    const body = req.body || {};
                    let roomId =
                        typeof body.roomId === "string" && body.roomId.trim()
                            ? body.roomId.trim()
                            : null;

                    const songId = body.songId;
                    const leaderId =
                        typeof body.leaderId === "string" && body.leaderId.trim()
                            ? body.leaderId.trim()
                            : null;

                    if (!leaderId) {
                        return res.status(400).json({ error: "leaderId is required" });
                    }
                    if (!Number.isFinite(Number(songId))) {
                        return res.status(400).json({ error: "songId is required" });
                    }

                    if (!roomId) {
                        roomId = Math.floor(Math.random() * 99 + 1).toString();
                    }

                    // Persist room in DB
                    createRoom({ roomId, songId: Number(songId), leaderId });

                    // Seed in-memory state so first socket join has consistent data
                    setLeader(roomId, leaderId);
                    setSong(roomId, Number(songId));

                    res.json({ ok: true, roomId, songId: Number(songId), leaderId });
                } catch (e) {
                    return res.status(500).json({ error: "Failed to create room" });
                }
            });

            // GET /api/room/:roomId
            app.get("/api/room/:roomId", (req, res) => {
                const roomId = String(req.params.roomId || "").trim();
                if (!roomId) return res.status(400).json({ error: "roomId is required" });

                const roomRow = getRoom(roomId);
                if (!roomRow) return res.status(404).json({ error: "Room not found" });

                const snapshot = getRoomStateSnapshot(roomId);

                // Best-effort sync: if in-memory is still empty, fill from DB row
                if (!snapshot.leaderId && roomRow.leader_id) {
                    setLeader(roomId, roomRow.leader_id);
                }
                if ((snapshot.songId === null || snapshot.songId === undefined) && roomRow.song_id) {
                    setSong(roomId, roomRow.song_id);
                }

                const snapshot2 = getRoomStateSnapshot(roomId);

                res.json({
                    room: {
                        roomId,
                        songId: roomRow.song_id,
                        leaderId: roomRow.leader_id,
                        createdAt: roomRow.created_at,
                    },
                    realtime: {
                        scrollPosition: snapshot2.scrollPosition,
                        speed: snapshot2.speed,
                        timestamp: snapshot2.timestamp,
                    },
                });
            });

            // GET /api/qr/:roomId -> { dataUrl }
            app.get("/api/qr/:roomId", async (req, res) => {
                const { roomId } = req.params;
                if (!roomId) return res.status(400).json({ error: "No roomId" });

                try {
                    // Try to find the first non-internal IPv4 address
                    // Prioritize Wi-Fi/Ethernet over VPN/Tailscale (which often start with 100. or 10. if it's Tailscale)
                    let localIp = null;
                    const nets = os.networkInterfaces();
                    let bestIp = null;
                    
                    for (const name of Object.keys(nets)) {
                        for (const net of nets[name]) {
                            if (net.family === "IPv4" && !net.internal) {
                                // If it starts with 192.168., it's most likely the local LAN
                                if (net.address.startsWith("192.168.")) {
                                    bestIp = net.address;
                                } else if (!bestIp && !name.toLowerCase().includes("tailscale") && !name.toLowerCase().includes("vpn")) {
                                    bestIp = net.address;
                                }
                            }
                        }
                    }
                    localIp = bestIp || null;

                    const reqHostname = req.hostname || "localhost";
                    const port = PORT;

                    // If user provides a PUBLIC_HOST in env, use it.
                    // Otherwise, try to use the detected LAN IP.
                    // Fall back to hostname if nothing else works.
                    let publicHost = reqHostname;
                    if (process.env.PUBLIC_HOST && process.env.PUBLIC_HOST.trim()) {
                        publicHost = process.env.PUBLIC_HOST.trim();
                    } else if (localIp) {
                        publicHost = localIp;
                    } else if (reqHostname === "0.0.0.0") {
                        publicHost = "localhost";
                    }

                    const protocol = "http";
                    const url = `${protocol}://${publicHost}:${port}/room/${encodeURIComponent(roomId)}`;

                    const dataUrl = await qrcode.toDataURL(url, {
                        errorCorrectionLevel: "M",
                        margin: 1,
                        width: 260,
                    });

                    res.json({ dataUrl, url });
                } catch {
                    res.status(500).json({ error: "Failed to generate QR" });
                }
            });

            // Everything else -> Next (Express middleware, no path-to-regexp patterns)
            app.use((req, res) => handle(req, res));
        })
        .then(() => {
            server.listen(PORT, hostname, () => {
                // eslint-disable-next-line no-console
                console.log(
                    `[singsync] server listening on http://${hostname}:${PORT} (dev=${dev})`
                );
            });
        })
        .catch((err) => {
            console.error("[singsync] failed to prepare next app:", err);
            process.exit(1);
        });
}

main();
