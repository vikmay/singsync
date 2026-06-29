const rooms = new Map();

/**
 * roomId -> {
 *   roomId: string;
 *   leaderId: string | null;
 *   songId: number | null;
 *   speed: number; // px per second-ish (we'll treat as relative)
 *   scrollPosition: { lineIndex: number; offsetPx: number };
 *   transposeDelta: number;
 *   timestamp: number;
 * }
 */
function getOrCreateRoom(roomId) {
    if (rooms.has(roomId)) return rooms.get(roomId);
    const state = {
        roomId,
        leaderId: null,
        songId: null,
        speed: 1,
        scrollPosition: { lineIndex: 0, offsetPx: 0 },
        transposeDelta: 0,
        timestamp: Date.now(),
    };
    rooms.set(roomId, state);
    return state;
}

function getRoomStateSnapshot(roomId) {
    return { ...getOrCreateRoom(roomId) };
}

function setLeader(roomId, leaderId) {
    const room = getOrCreateRoom(roomId);
    room.leaderId = leaderId;
    room.timestamp = Date.now();
    return room;
}

function setSong(roomId, songId) {
    const room = getOrCreateRoom(roomId);
    room.songId = Number(songId);
    room.transposeDelta = 0; // Reset transpose on song change
    room.timestamp = Date.now();
    return room;
}

function setTransposeDelta(roomId, delta) {
    const room = getOrCreateRoom(roomId);
    room.transposeDelta = Number(delta) || 0;
    room.timestamp = Date.now();
    return room;
}

function updateScroll(roomId, scrollPosition, speed) {
    const room = getOrCreateRoom(roomId);
    room.scrollPosition = {
        lineIndex: Number(scrollPosition?.lineIndex ?? 0),
        offsetPx: Number(scrollPosition?.offsetPx ?? 0),
    };
    if (typeof speed === "number" && Number.isFinite(speed)) room.speed = speed;
    room.timestamp = Date.now();
    return room;
}

module.exports = {
    getRoomStateSnapshot,
    setLeader,
    setSong,
    setTransposeDelta,
    updateScroll,
    // exported for debugging/testing
    _rooms: rooms,
};
