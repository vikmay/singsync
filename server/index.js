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
    listAllSongs,
    getSongByTitleAndArtist,
    getSongById,
    ensureMigrations,
    createRoom,
    getRoom,
    addSong,
    updateSong,
    deleteSong,
    deleteRoom,
    listRecentRooms,
} = require("./sqlite");

const cheerio = require("cheerio");
const { registerSocketHandlers } = require("./socket");
const {
    getRoomStateSnapshot,
    setLeader,
    setSong,
    setProposal,
    deleteRoomState,
} = require("./roomState");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH || "database.sqlite";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";

async function main() {
    await ensureMigrations(DB_PATH);
    initDb(DB_PATH);

    const app = express();
    app.use(express.json({ limit: "50mb" }));

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
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
                    const artist = typeof req.body?.artist === "string" ? req.body.artist.trim() : "";
                    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
                    const defaultFontScale = typeof req.body?.defaultFontScale === "number" ? req.body.defaultFontScale : 1.0;

                    if (!title) return res.status(400).json({ error: "title is required" });
                    if (!artist) return res.status(400).json({ error: "artist is required" });
                    if (lines.length === 0) return res.status(400).json({ error: "lines are required" });

                    const content = JSON.stringify({
                        version: 1,
                        lines,
                        defaultFontScale,
                    });

                    addSong({ title, artist, content });

                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to add song" });
                }
            });

            // GET /api/songs/export
            app.get("/api/songs/export", (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const songs = listAllSongs();
                    res.json({ songs });
                } catch {
                    res.status(500).json({ error: "Failed to export songs" });
                }
            });

            // POST /api/songs/import
            app.post("/api/songs/import", (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const songs = Array.isArray(req.body?.songs) ? req.body.songs : [];
                    let imported = 0;
                    let skipped = 0;

                    for (const song of songs) {
                        const title = typeof song.title === "string" ? song.title.trim() : "";
                        const artist = typeof song.artist === "string" ? song.artist.trim() : "";
                        const content = typeof song.content === "string" ? song.content : null;

                        if (!title || !artist || !content) {
                            skipped++;
                            continue;
                        }

                        const exists = getSongByTitleAndArtist(title, artist);
                        if (exists) {
                            skipped++;
                            continue;
                        }

                        addSong({ title, artist, content });
                        imported++;
                    }

                    res.json({ ok: true, imported, skipped });
                } catch (e) {
                    console.error("Import error", e);
                    res.status(500).json({ error: "Failed to import songs" });
                }
            });

            // PUT /api/song/:id
            app.put("/api/song/:id", (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const id = req.params.id;
                    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
                    const artist = typeof req.body?.artist === "string" ? req.body.artist.trim() : "";
                    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
                    const defaultFontScale = typeof req.body?.defaultFontScale === "number" ? req.body.defaultFontScale : 1.0;

                    if (!title) return res.status(400).json({ error: "title is required" });
                    if (!artist) return res.status(400).json({ error: "artist is required" });
                    if (lines.length === 0) return res.status(400).json({ error: "lines are required" });

                    const content = JSON.stringify({
                        version: 1,
                        lines,
                        defaultFontScale,
                    });

                    updateSong({ id, title, artist, content });
                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to update song" });
                }
            });

            // DELETE /api/song/:id
            app.delete("/api/song/:id", (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    deleteSong(req.params.id);
                    res.json({ ok: true });
                } catch {
                    res.status(500).json({ error: "Failed to delete song" });
                }
            });

            // POST /api/parse-link
            app.post("/api/parse-link", async (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const url = req.body?.url;
                    if (!url) return res.status(400).json({ error: "url is required" });

                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                        }
                    });
                    if (!response.ok) throw new Error("Failed to fetch url");
                    
                    const buffer = await response.arrayBuffer();
                    let html = new TextDecoder('utf-8').decode(buffer);
                    
                    if (html.toLowerCase().includes('windows-1251')) {
                        html = new TextDecoder('windows-1251').decode(buffer);
                    }

                    const $ = cheerio.load(html);
                    
                    let title = "";
                    let artist = "";
                    let rawLines = "";

                    const hostname = new URL(url).hostname;

                    if (hostname.includes('pisennyk')) {
                        title = $('h1').text().replace(/акорди|текст/gi, '').trim();
                        artist = $('.song-artist').text().trim() || $('.breadcrumbs a').eq(1).text().trim() || $('a[href^="/artists/"]').first().text().trim();
                        rawLines = $('.song-text').text() || $('pre').text();
                    } else if (hostname.includes('chords.com.ua')) {
                        const h1 = $('h1').text().trim();
                        const parts = h1.split('-');
                        if (parts.length > 1) {
                            artist = parts[0].trim();
                            title = parts.slice(1).join('-').replace(/акорди/gi, '').trim();
                        } else {
                            title = h1;
                        }
                        rawLines = $('.song-text').text() || $('pre').text();
                    } else if (hostname.includes('pisni.org.ua')) {
                        title = $('h1').text().trim();
                        artist = '';
                        rawLines = $('pre').text() || $('.songword').text();
                    } else if (hostname.includes('amdm.ru') || hostname.includes('mychords.net')) {
                        title = $('h1').text().trim();
                        artist = $('.artist-name').text().trim() || $('h1').parent().find('a').first().text().trim();
                        rawLines = $('pre').text();
                    }
                    
                    // Generic fallback
                    if (!rawLines) {
                        rawLines = $('pre').first().text();
                    }
                    if (!rawLines) {
                        rawLines = $('.song-text').first().text();
                    }
                    
                    if (!title) {
                        title = $('h1').first().text().trim();
                    }
                    if (!title) {
                        title = $('title').text().replace(/(акорди|chords|текст|пісні|tabs|табулатури)/gi, '').split('|')[0].trim();
                    }

                    res.json({ title, artist, rawLines: rawLines.trim() });
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Rooms APIs
            app.get("/api/rooms/active", (req, res) => {
                try {
                    const limit = req.query.limit ? Number(req.query.limit) : 10;
                    const rooms = listRecentRooms(limit);
                    res.json({ rooms });
                } catch {
                    res.status(500).json({ error: "Failed to fetch active rooms" });
                }
            });

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
                        roomId = Math.floor(1000 + Math.random() * 9000).toString();
                    }

                    // Persist room in DB
                    createRoom({ roomId, songId: Number(songId), leaderId });

                    // Seed in-memory state so first socket join has consistent data
                    const { clearedRoomIds } = setLeader(roomId, leaderId);
                    setSong(roomId, Number(songId));

                    // Notify other rooms that they lost this leader
                    for (const clearedId of clearedRoomIds) {
                        io.to(clearedId).emit("leader_change", {
                            roomId: clearedId,
                            leaderId: "",
                            timestamp: Date.now(),
                        });
                    }

                    res.json({ ok: true, roomId, songId: Number(songId), leaderId });
                } catch (e) {
                    return res.status(500).json({ error: "Failed to create room" });
                }
            });

            // POST /api/room/:roomId/propose
            app.post("/api/room/:roomId/propose", (req, res) => {
                try {
                    const roomId = req.params.roomId;
                    const { songId, songTitle, artist, userId } = req.body || {};

                    if (!songId || !songTitle) {
                        return res.status(400).json({ error: "Missing song info" });
                    }

                    const snapshot = getRoomStateSnapshot(roomId);
                    if (!snapshot || !snapshot.leaderId) {
                        return res.status(404).json({ error: "На вечірці ще немає ведучого - пропозиція не надіслана!" });
                    }

                    if (userId === snapshot.leaderId) {
                        // Якщо це ведучий, то одразу змінюємо пісню замість пропозиції
                        setSong(roomId, Number(songId));
                        io.to(roomId).emit("song_change", {
                            roomId,
                            songId: Number(songId),
                            timestamp: Date.now(),
                        });
                        return res.json({ ok: true, changed: true });
                    }

                    const proposal = {
                        songId: Number(songId),
                        songTitle,
                        artist: artist || "",
                        timestamp: Date.now(),
                    };

                    setProposal(roomId, proposal);

                    io.to(roomId).emit("song_proposed", proposal);

                    res.json({ ok: true, proposed: true });
                } catch (e) {
                    res.status(500).json({ error: "Failed to propose song" });
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

            // DELETE /api/room/:roomId
            app.delete("/api/room/:roomId", (req, res) => {
                if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                try {
                    const roomId = req.params.roomId;
                    deleteRoom(roomId);
                    deleteRoomState(roomId);
                    io.to(roomId).emit("room_deleted");
                    io.in(roomId).socketsLeave(roomId);
                    res.json({ ok: true });
                } catch (e) {
                    res.status(500).json({ error: "Failed to delete room" });
                }
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
                    // Determine host and protocol from request headers
                    let hostHeader = req.headers.host || reqHostname;
                    let protocol = req.headers['x-forwarded-proto'] || req.protocol || "http";

                    // Force HTTPS if it's our duckdns domain
                    if (hostHeader.includes('duckdns.org')) {
                        protocol = "https";
                    } else if (process.env.PUBLIC_HOST) {
                        hostHeader = process.env.PUBLIC_HOST.replace(/^https?:\/\//, '');
                        protocol = process.env.PUBLIC_HOST.startsWith('https') ? 'https' : 'http';
                    } else if (localIp && (!req.headers.host || req.headers.host.startsWith('localhost'))) {
                        // Fallback to local IP only if accessed via localhost locally
                        hostHeader = `${localIp}:${port}`;
                    }

                    const url = `${protocol}://${hostHeader}/room/${encodeURIComponent(roomId)}`;

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
