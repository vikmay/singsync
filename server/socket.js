const {
    getRoomStateSnapshot,
    setLeader,
    setSong,
    setTransposeDelta,
    updateScroll,
    setProposal,
} = require("./roomState");

function registerSocketHandlers(io, { getRoomStateSnapshot: getSnapshotFromDeps } = {}) {
    const getSnapshot = typeof getSnapshotFromDeps === "function" ? getSnapshotFromDeps : getRoomStateSnapshot;

    // roomId -> Set<socketId>
    const roomMembers = new Map();

    function addMember(roomId, socketId) {
        if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set());
        roomMembers.get(roomId).add(socketId);
    }

    function removeMember(roomId, socketId) {
        if (!roomMembers.has(roomId)) return;
        roomMembers.get(roomId).delete(socketId);
        if (roomMembers.get(roomId).size === 0) roomMembers.delete(roomId);
    }

    function getMembers(roomId) {
        return roomMembers.get(roomId) ? Array.from(roomMembers.get(roomId)) : [];
    }

    function safeString(v) {
        return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
    }

    function emitToRoom(roomId, event, payload) {
        io.to(roomId).emit(event, payload);
    }

    io.on("connection", (socket) => {
        socket.data.userId = null;
        socket.data.roomId = null;

        socket.on("room_join", (payload, ack) => {
            try {
                const roomId = safeString(payload?.roomId);
                const userId = safeString(payload?.userId) || socket.id;

                if (!roomId) {
                    if (typeof ack === "function") ack({ ok: false, error: "roomId is required" });
                    return;
                }

                socket.join(roomId);
                socket.data.userId = userId;
                socket.data.roomId = roomId;

                addMember(roomId, socket.id);

                const snapshot = getSnapshot(roomId);

                // Leader selection: first join becomes leader (for MVP).
                if (!snapshot.leaderId) {
                    setLeader(roomId, userId);
                    emitToRoom(roomId, "leader_change", {
                        roomId,
                        leaderId: userId,
                        timestamp: Date.now(),
                    });
                }

                const updated = getSnapshot(roomId);

                // Send current state to the joining client.
                socket.emit("leader_change", {
                    roomId,
                    leaderId: updated.leaderId,
                    timestamp: Date.now(),
                });

                socket.emit("song_change", {
                    roomId,
                    songId: updated.songId,
                    timestamp: Date.now(),
                });

                socket.emit("transpose_change", {
                    roomId,
                    transposeDelta: updated.transposeDelta,
                    timestamp: Date.now(),
                });

                socket.emit("speed_change", {
                    roomId,
                    speed: updated.speed,
                    timestamp: Date.now(),
                });

                socket.emit("scroll_update", {
                    roomId,
                    scrollPosition: updated.scrollPosition,
                    speed: updated.speed,
                    timestamp: Date.now(),
                });

                if (updated.proposal) {
                    socket.emit("song_proposed", updated.proposal);
                }

                if (typeof ack === "function") ack({ ok: true });
            } catch (err) {
                if (typeof ack === "function") ack({ ok: false, error: "room_join failed" });
            }
        });

        // Leader-only events (server checks leaderId)
        socket.on("scroll_update", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== userId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can update scroll" });
                return;
            }

            const scrollPosition = payload?.scrollPosition;
            const speed = payload?.speed;

            updateScroll(roomId, scrollPosition, speed);

            const updated = getSnapshot(roomId);

            emitToRoom(roomId, "scroll_update", {
                roomId,
                scrollPosition: updated.scrollPosition,
                speed: updated.speed,
                timestamp: payload?.timestamp ?? Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("song_change", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== userId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can change song" });
                return;
            }

            const songId = payload?.songId;
            if (typeof songId !== "number" && typeof songId !== "string") {
                if (typeof ack === "function") ack({ ok: false, error: "songId is required" });
                return;
            }

            setSong(roomId, Number(songId));

            const updated = getSnapshot(roomId);

            emitToRoom(roomId, "song_change", {
                roomId,
                songId: updated.songId,
                timestamp: payload?.timestamp ?? Date.now(),
            });

            // When song changes, reset scroll to 0 for consistency.
            updateScroll(roomId, { lineIndex: 0, offsetPx: 0 }, updated.speed);

            const updated2 = getSnapshot(roomId);
            emitToRoom(roomId, "scroll_update", {
                roomId,
                scrollPosition: updated2.scrollPosition,
                speed: updated2.speed,
                timestamp: Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("leader_change", (payload, ack) => {
            // Optional for MVP: we only allow leader to change itself by disconnect/reselection,
            // but expose event handler anyway for future extension.
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const requesterId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== requesterId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can change leader" });
                return;
            }

            const nextLeaderId = safeString(payload?.leaderId);
            if (!nextLeaderId) {
                if (typeof ack === "function") ack({ ok: false, error: "leaderId is required" });
                return;
            }

            setLeader(roomId, nextLeaderId);

            emitToRoom(roomId, "leader_change", {
                roomId,
                leaderId: nextLeaderId,
                timestamp: payload?.timestamp ?? Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        // Allow any user to take leadership (Take Over)
        socket.on("take_leadership", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            if (!userId) {
                if (typeof ack === "function") ack({ ok: false, error: "userId is required" });
                return;
            }

            setLeader(roomId, userId);

            emitToRoom(roomId, "leader_change", {
                roomId,
                leaderId: userId,
                timestamp: Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("clear_proposal", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== userId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can clear proposal" });
                return;
            }

            setProposal(roomId, null);

            emitToRoom(roomId, "song_proposed", null); // broadcast clear
            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("speed_change", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== userId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can change speed" });
                return;
            }

            const speed = payload?.speed;
            const nextSpeed = typeof speed === "number" && Number.isFinite(speed) ? speed : null;
            if (nextSpeed === null) {
                if (typeof ack === "function") ack({ ok: false, error: "speed must be a finite number" });
                return;
            }

            // Persist via updateScroll (it updates speed if provided)
            updateScroll(roomId, payload?.scrollPosition ?? snapshot.scrollPosition, nextSpeed);

            const updated = getSnapshot(roomId);

            emitToRoom(roomId, "speed_change", {
                roomId,
                speed: updated.speed,
                timestamp: payload?.timestamp ?? Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("transpose_change", (payload, ack) => {
            const roomId = safeString(payload?.roomId);
            if (!roomId) return;

            const userId = safeString(payload?.userId) || socket.data.userId;
            const snapshot = getSnapshot(roomId);

            if (!snapshot.leaderId || snapshot.leaderId !== userId) {
                if (typeof ack === "function") ack({ ok: false, error: "Only leader can change transpose" });
                return;
            }

            const transposeDelta = payload?.transposeDelta;
            const nextDelta = typeof transposeDelta === "number" && Number.isFinite(transposeDelta) ? transposeDelta : 0;

            setTransposeDelta(roomId, nextDelta);

            const updated = getSnapshot(roomId);

            emitToRoom(roomId, "transpose_change", {
                roomId,
                transposeDelta: updated.transposeDelta,
                timestamp: payload?.timestamp ?? Date.now(),
            });

            if (typeof ack === "function") ack({ ok: true });
        });

        socket.on("disconnect", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const userId = socket.data.userId;
            removeMember(roomId, socket.id);

            const snapshot = getSnapshot(roomId);

            // If the leader disconnected, we NO LONGER promote another member or clear the leader.
            // This allows the leader to navigate to the home page or refresh without losing their role.
            // If the leader actually left for good, another participant can manually click "Take Leadership".
        });
    });
}

module.exports = {
    registerSocketHandlers,
};
