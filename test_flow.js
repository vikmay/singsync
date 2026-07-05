const { initDb, createRoom, getRoom, listRecentRooms } = require('./server/sqlite');
const db = initDb('database.sqlite');

// User UUID
const leaderId = 'u-test-123';

// Create Room A
createRoom({ roomId: 'A', songId: 14, leaderId });
console.log('After creating A, active rooms:', listRecentRooms());

// Create Room B
createRoom({ roomId: 'B', songId: 14, leaderId });
console.log('After creating B, active rooms:', listRecentRooms());
