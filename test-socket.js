const io = require('socket.io-client');
const socket = io('http://localhost:3001', { transports: ['websocket'] });
socket.on('connect', () => {
    console.log('Connected', socket.id);
    socket.emit('room_join', { roomId: '0E4B3E62', userId: 'test' }, (res) => {
        console.log('Joined:', res);
        socket.emit('scroll_update', { roomId: '0E4B3E62', userId: 'test', scrollPosition: {lineIndex: 5, offsetPx: 0}, speed: 1 }, (res2) => {
            console.log('Scrolled:', res2);
            setTimeout(() => process.exit(0), 500);
        });
    });
});
socket.on('connect_error', (err) => console.error('Error:', err.message));
