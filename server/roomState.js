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
        isAutoScrolling: false,
        autoScrollSpeed: 0.1,
        queue: [], // array of song objects: { id, song_id, title, artist }
        currentQueueIndex: -1,
        requests: [], // array of proposal objects
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

function updateAutoScroll(roomId, isAutoScrolling, autoScrollSpeed) {
    const room = getOrCreateRoom(roomId);
    room.isAutoScrolling = Boolean(isAutoScrolling);
    if (typeof autoScrollSpeed === "number" && Number.isFinite(autoScrollSpeed)) {
        room.autoScrollSpeed = autoScrollSpeed;
    }
    room.timestamp = Date.now();
    return room;
}

function deleteRoomState(roomId) {
    rooms.delete(roomId);
}

function setQueue(roomId, queue) {
    const room = getOrCreateRoom(roomId);
    room.queue = Array.isArray(queue) ? queue : [];
    room.currentQueueIndex = room.queue.length > 0 ? 0 : -1;
    room.timestamp = Date.now();
    return room;
}

function addQueueItem(roomId, item) {
    const room = getOrCreateRoom(roomId);
    room.queue.push(item);
    if (room.currentQueueIndex === -1) {
        room.currentQueueIndex = 0;
    }
    room.timestamp = Date.now();
    return room;
}

function removeQueueItem(roomId, index) {
    const room = getOrCreateRoom(roomId);
    if (index >= 0 && index < room.queue.length) {
        room.queue.splice(index, 1);
        if (room.currentQueueIndex >= room.queue.length) {
            room.currentQueueIndex = room.queue.length - 1;
        } else if (index < room.currentQueueIndex) {
            room.currentQueueIndex--;
        }
    }
    room.timestamp = Date.now();
    return room;
}

function nextQueueItem(roomId) {
    const room = getOrCreateRoom(roomId);
    if (room.currentQueueIndex >= 0 && room.currentQueueIndex < room.queue.length - 1) {
        room.currentQueueIndex++;
    }
    room.timestamp = Date.now();
    return room;
}

function playQueueItemNow(roomId, index) {
    const room = getOrCreateRoom(roomId);
    if (index >= 0 && index < room.queue.length) {
        if (index !== room.currentQueueIndex) {
            const [item] = room.queue.splice(index, 1);
            let targetIndex = room.currentQueueIndex;
            if (targetIndex < 0) targetIndex = -1;
            
            if (index < targetIndex) {
                targetIndex--;
            }
            
            room.queue.splice(targetIndex + 1, 0, item);
            room.currentQueueIndex = targetIndex + 1;
        }
    }
    room.timestamp = Date.now();
    return room;
}

function moveQueueItem(roomId, index, direction) {
    const room = getOrCreateRoom(roomId);
    if (index >= 0 && index < room.queue.length) {
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < room.queue.length) {
            // Swap items
            const temp = room.queue[index];
            room.queue[index] = room.queue[newIndex];
            room.queue[newIndex] = temp;
            
            // Adjust currentQueueIndex if needed
            if (room.currentQueueIndex === index) {
                room.currentQueueIndex = newIndex;
            } else if (room.currentQueueIndex === newIndex) {
                room.currentQueueIndex = index;
            }
        }
    }
    room.timestamp = Date.now();
    return room;
}

function addRequest(roomId, request) {
    const room = getOrCreateRoom(roomId);
    room.requests.push(request);
    room.timestamp = Date.now();
    return room;
}

function removeRequest(roomId, index) {
    const room = getOrCreateRoom(roomId);
    if (index >= 0 && index < room.requests.length) {
        room.requests.splice(index, 1);
    }
    room.timestamp = Date.now();
    return room;
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
    updateAutoScroll,
    deleteRoomState,
    setQueue,
    addQueueItem,
    removeQueueItem,
    nextQueueItem,
    playQueueItemNow,
    moveQueueItem,
    addRequest,
    removeRequest,
    // exported for debugging/testing
    _rooms: rooms,
};
