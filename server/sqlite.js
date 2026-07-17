const path = require("path");
const Database = require("better-sqlite3");

let db;

function openDb(dbPath) {
    const normalized = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
    db = new Database(normalized);
    // SQLite synchronous + WAL for better realtime behavior
    db.pragma("journal_mode = WAL");
    db.function("ua_lower", (s) => (s ? String(s).toLowerCase() : ""));
    return db;
}

function ensureMigrations(dbPath) {
    const normalized = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
    const tmpDb = new Database(normalized);

    tmpDb.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      song_id INTEGER NOT NULL,
      leader_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (song_id) REFERENCES songs(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS setlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS setlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setlist_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );
  `);

    // Seed if songs table is empty
    const { count } = tmpDb
        .prepare("SELECT COUNT(*) as count FROM songs")
        .get();

    if (count === 0) {
        const seedSongs = [
            {
                title: "Приклад пісні",
                artist: "Demo",
                content: JSON.stringify({
                    version: 1,
                    lines: [
                        { chords: "Am", text: "Hello, darkness" },
                        { chords: "F", text: "my old friend" },
                        { chords: "C", text: "I've come to talk with you again" },
                        { chords: "", text: "" },
                    ],
                }),
            },
            {
                title: "Друга пісня",
                artist: "Demo",
                content: JSON.stringify({
                    version: 1,
                    lines: [
                        { chords: "G", text: "We will, we will rock you" },
                        { chords: "D", text: "Sing it loud in the night" },
                        { chords: "", text: "" },
                    ],
                }),
            },
        ];

        const insert = tmpDb.prepare(
            "INSERT INTO songs (title, artist, content) VALUES (@title, @artist, @content)"
        );
        const tx = tmpDb.transaction((rows) => {
            for (const r of rows) insert.run(r);
        });
        tx(seedSongs);
    }

    tmpDb.close();
}

function initDb(dbPath) {
    if (db) return db;
    return openDb(dbPath);
}

function listSongs({ query } = {}) {
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
        return db
            .prepare(
                "SELECT id, title, artist, created_at FROM songs ORDER BY ua_lower(title) ASC, ua_lower(artist) ASC LIMIT 200"
            )
            .all();
    }

    const terms = q.split(/\s+/).filter(Boolean);
    
    const conditions = [];
    const params = {};
    
    terms.forEach((term, index) => {
        const paramKey = `q${index}`;
        conditions.push(`(ua_lower(title) LIKE @${paramKey} OR ua_lower(artist) LIKE @${paramKey} OR ua_lower(content) LIKE @${paramKey})`);
        params[paramKey] = `%${term.toLowerCase()}%`;
    });

    const whereClause = conditions.join(" AND ");

    return db
        .prepare(
            `
      SELECT id, title, artist, created_at
      FROM songs
      WHERE ${whereClause}
      ORDER BY ua_lower(title) ASC, ua_lower(artist) ASC
      LIMIT 200
    `
        )
        .all(params);
}
function listAllSongs() {
    return db
        .prepare(
            "SELECT id, title, artist, content, created_at FROM songs ORDER BY created_at DESC"
        )
        .all();
}

function getSongByTitleAndArtist(title, artist) {
    const t = safeText(title);
    const a = safeText(artist);
    if (!t || !a) return null;
    return db
        .prepare("SELECT id FROM songs WHERE ua_lower(title) = ua_lower(@title) AND ua_lower(artist) = ua_lower(@artist)")
        .get({ title: t, artist: a });
}

function getSongById(id) {
    const song = db
        .prepare(
            `
      SELECT id, title, artist, content, created_at
      FROM songs
      WHERE id = @id
    `
        )
        .get({ id: Number(id) });

    if (!song) return null;

    // Return parsed content (server-side)
    let parsed = null;
    try {
        parsed = JSON.parse(song.content);
    } catch {
        parsed = null;
    }

    return {
        ...song,
        parsedContent: parsed,
    };
}

function cleanupOldRooms() {
    db.prepare(`
        DELETE FROM rooms 
        WHERE created_at < datetime('now', '-24 hours')
    `).run();
}

function createRoom({ roomId, songId, leaderId }) {
    cleanupOldRooms(); // Очищаємо старі кімнати при створенні нової

    const id = safeText(roomId);
    const sId = Number(songId);
    const lId = safeText(leaderId);

    if (!id) throw new Error("roomId is required");
    if (!Number.isFinite(sId) || sId <= 0) throw new Error("songId is invalid");
    if (!lId) throw new Error("leaderId is required");

    db.prepare(`
        UPDATE rooms 
        SET leader_id = '' 
        WHERE leader_id = @leader_id
    `).run({ leader_id: lId });

    db.prepare(
        `
      INSERT OR REPLACE INTO rooms (id, song_id, leader_id, created_at)
      VALUES (@id, @song_id, @leader_id, datetime('now'))
    `
    ).run({ id, song_id: sId, leader_id: lId });

    return getRoom(roomId);
}

function updateRoomLeader(roomId, leaderId) {
    const id = safeText(roomId);
    const lId = safeText(leaderId) || ''; // Allow empty string for clearing leader
    if (!id) return;

    // Спершу забираємо лідерство з інших кімнат цього користувача
    if (lId) {
        db.prepare(`
            UPDATE rooms 
            SET leader_id = '' 
            WHERE leader_id = @leader_id
        `).run({ leader_id: lId });
    }

    // Встановлюємо нового лідера
        try {
            db.prepare(`
            UPDATE rooms 
            SET leader_id = @leaderId 
            WHERE id = @id
        `).run({ id, leaderId: lId });
        } catch (e) {
            console.error("updateRoomLeader error", e);
        }
}

function updateRoomSong(roomId, songId) {
    const id = safeText(roomId);
    if (!id) return;
    try {
        db.prepare("UPDATE rooms SET song_id = @songId WHERE id = @id").run({ songId: Number(songId), id });
    } catch (e) {
        console.error("updateRoomSong error", e);
    }
}

function getRoom(roomId) {
    const id = safeText(roomId);
    if (!id) return null;

    return db
        .prepare(
            `
      SELECT id, song_id, leader_id, created_at
      FROM rooms
      WHERE id = @id
    `
        )
        .get({ id });
}

function deleteRoom(roomId) {
    const id = safeText(roomId);
    if (!id) return;

    db.prepare(`DELETE FROM rooms WHERE id = @id`).run({ id });
}

function listRecentRooms(limit = 10) {
    return db
        .prepare(
            `
      SELECT r.id as roomId, r.song_id as songId, r.leader_id as leaderId, r.created_at as createdAt,
             s.title as songTitle, s.artist as songArtist
      FROM rooms r
      JOIN songs s ON r.song_id = s.id
      WHERE r.created_at >= datetime('now', '-24 hours')
      ORDER BY r.created_at DESC
      LIMIT @limit
    `
        )
        .all({ limit: Number(limit) });
}

function safeText(v) {
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function addSong({ title, artist, content }) {
    const t = safeText(title);
    const a = safeText(artist);

    if (!t) throw new Error("title is required");
    if (!a) throw new Error("artist is required");
    if (!content || typeof content !== "string") throw new Error("content is required");

    db.prepare(
        `
      INSERT INTO songs (title, artist, content, created_at)
      VALUES (@title, @artist, @content, datetime('now'))
    `
    ).run({ title: t, artist: a, content });
}

function updateSong({ id, title, artist, content }) {
    const t = safeText(title);
    const a = safeText(artist);
    const sId = Number(id);

    if (!Number.isFinite(sId) || sId <= 0) throw new Error("id is invalid");
    if (!t) throw new Error("title is required");
    if (!a) throw new Error("artist is required");
    if (!content || typeof content !== "string") throw new Error("content is required");

    db.prepare(
        `
      UPDATE songs 
      SET title = @title, artist = @artist, content = @content
      WHERE id = @id
    `
    ).run({ id: sId, title: t, artist: a, content });
}

function deleteSong(id) {
    const sId = Number(id);
    if (!Number.isFinite(sId) || sId <= 0) throw new Error("id is invalid");

    // Спочатку видаляємо кімнати, пов'язані з цією піснею
    db.prepare("DELETE FROM rooms WHERE song_id = @id").run({ id: sId });
    // Потім саму пісню
    db.prepare("DELETE FROM songs WHERE id = @id").run({ id: sId });
}

// Setlists CRUD
function listSetlists() {
    return db
        .prepare("SELECT id, title, created_at FROM setlists ORDER BY created_at DESC")
        .all();
}

function getSetlist(id) {
    const sId = Number(id);
    const setlist = db.prepare("SELECT id, title, created_at FROM setlists WHERE id = @id").get({ id: sId });
    if (!setlist) return null;

    const items = db.prepare(`
        SELECT si.id as item_id, si.song_id, si.order_index, s.title, s.artist 
        FROM setlist_items si
        JOIN songs s ON si.song_id = s.id
        WHERE si.setlist_id = @id
        ORDER BY si.order_index ASC
    `).all({ id: sId });

    return { ...setlist, items };
}

function createSetlist(title, items = []) {
    const t = safeText(title);
    if (!t) throw new Error("title is required");

    const info = db.prepare("INSERT INTO setlists (title) VALUES (@title)").run({ title: t });
    const setlistId = info.lastInsertRowid;

    if (items.length > 0) {
        const insertItem = db.prepare("INSERT INTO setlist_items (setlist_id, song_id, order_index) VALUES (@setlist_id, @song_id, @order_index)");
        const tx = db.transaction((items) => {
            for (let i = 0; i < items.length; i++) {
                insertItem.run({ setlist_id: setlistId, song_id: Number(items[i]), order_index: i });
            }
        });
        tx(items);
    }
    return setlistId;
}

function updateSetlist(id, title, items = []) {
    const sId = Number(id);
    const t = safeText(title);
    if (!t) throw new Error("title is required");

    db.prepare("UPDATE setlists SET title = @title WHERE id = @id").run({ id: sId, title: t });

    // Re-create items
    db.prepare("DELETE FROM setlist_items WHERE setlist_id = @id").run({ id: sId });
    
    if (items.length > 0) {
        const insertItem = db.prepare("INSERT INTO setlist_items (setlist_id, song_id, order_index) VALUES (@setlist_id, @song_id, @order_index)");
        const tx = db.transaction((items) => {
            for (let i = 0; i < items.length; i++) {
                insertItem.run({ setlist_id: sId, song_id: Number(items[i]), order_index: i });
            }
        });
        tx(items);
    }
}

function deleteSetlist(id) {
    const sId = Number(id);
    db.prepare("DELETE FROM setlist_items WHERE setlist_id = @id").run({ id: sId });
    db.prepare("DELETE FROM setlists WHERE id = @id").run({ id: sId });
}

module.exports = {
    ensureMigrations,
    initDb,
    listSongs,
    listAllSongs,
    getSongByTitleAndArtist,
    getSongById,
    addSong,
    updateSong,
    deleteSong,
    createRoom,
    updateRoomLeader,
    updateRoomSong,
    getRoom,
    deleteRoom,
    listRecentRooms,
    listSetlists,
    getSetlist,
    createSetlist,
    updateSetlist,
    deleteSetlist,
};
