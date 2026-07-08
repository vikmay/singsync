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
    const clearedRoomIds = [];
    if (leaderId) {
        for (const [key, state] of rooms.entries()) {
            if (key !== roomId && state.leaderId === leaderId) {
                state.leaderId = '';
                clearedRoomIds.push(key);
            }
        }
    }

    const room = getOrCreateRoom(roomId);
    room.leaderId = leaderId;
    room.timestamp = Date.now();
    return { room, clearedRoomIds };
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

function deleteRoomState(roomId) {
    rooms.delete(roomId);
}

function cleanupOldMemoryRooms() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    for (const [roomId, state] of rooms.entries()) {
        if (now - state.timestamp > TWENTY_FOUR_HOURS) {
            rooms.delete(roomId);
        }
    }
}

// Запускаємо очищення раз на годину
setInterval(cleanupOldMemoryRooms, 60 * 60 * 1000);

module.exports = {
    getRoomStateSnapshot,
    setLeader,
    setSong,
    setTransposeDelta,
    updateScroll,
    setProposal,
    deleteRoomState,
    // exported for debugging/testing
    _rooms: rooms,
};
