const rooms = new Map();

/**
 * roomId -> {
 *   roomId: string;
 *   leaderId: string | null;
 *   songId: number | null;
 *   speed: number; // px per second-ish (we'll treat as relative)
 *   scrollPosition: { lineIndex: number; offsetPercent: number };
 *   transposeDelta: number;
 *   proposal: { songId: number, songTitle: string, artist: string } | null;
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
        scrollPosition: { lineIndex: 0, offsetPercent: 0 },
        transposeDelta: 0,
        proposal: null,
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
    room.proposal = null; // Clear proposal when song changes
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
        offsetPercent: Number(scrollPosition?.offsetPercent ?? 0),
    };
    if (typeof speed === "number" && Number.isFinite(speed)) room.speed = speed;
    room.timestamp = Date.now();
    return room;
}

function setProposal(roomId, proposal) {
    const room = getOrCreateRoom(roomId);
    room.proposal = proposal;
    room.timestamp = Date.now();
    return room;
}

module.exports = {
    getRoomStateSnapshot,
    setLeader,
    setSong,
    setTransposeDelta,
    updateScroll,
    setProposal,
    // exported for debugging/testing
    _rooms: rooms,
};
