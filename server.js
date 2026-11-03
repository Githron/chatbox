const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 10 * 1024 * 1024 // Allow up to 10MB payloads for file uploads
});

const PORT = process.env.PORT || 3000;

// Serve static assets from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store for active rooms
const rooms = new Map();

// Helper to generate pastel user color based on username
function generateUserColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUsername = null;

  // Handle joining a room
  socket.on('join-room', ({ roomCode, username }, callback) => {
    if (!roomCode || !username) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Room code and username are required.' });
      }
      return;
    }

    const cleanRoomCode = roomCode.trim().toUpperCase();
    const cleanUsername = username.trim();

    if (cleanUsername.length < 1 || cleanUsername.length > 25) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Username must be between 1 and 25 characters.' });
      }
      return;
    }

    // Leave any existing room first
    if (currentRoom) {
      leaveCurrentRoom(socket);
    }

    // Initialize room if it doesn't exist
    if (!rooms.has(cleanRoomCode)) {
      rooms.set(cleanRoomCode, {
        users: new Map(),
        messages: []
      });
    }

    const room = rooms.get(cleanRoomCode);

    // Check if username is already taken in this room
    const existingUsers = Array.from(room.users.values()).map(u => u.username.toLowerCase());
    if (existingUsers.includes(cleanUsername.toLowerCase())) {
      if (typeof callback === 'function') {
        return callback({ success: false, error: 'Username is already taken in this room. Please choose another.' });
      }
      return;
    }

    const userColor = generateUserColor(cleanUsername);

    // Store user session info
    currentRoom = cleanRoomCode;
    currentUsername = cleanUsername;

    socket.join(cleanRoomCode);
    socket.userRoomInfo = { roomCode: cleanRoomCode, username: cleanUsername, color: userColor };
    room.users.set(socket.id, { username: cleanUsername, color: userColor });

    // Create a system join message
    const joinMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      system: true,
      text: `${cleanUsername} joined the room`,
      timestamp: new Date().toISOString()
    };

    // Store in message history
    room.messages.push(joinMessage);
    if (room.messages.length > 200) room.messages.shift();

    // Broadcast system message to everyone in room
    io.to(cleanRoomCode).emit('new-message', joinMessage);

    // Notify room of updated user list
    const userList = Array.from(room.users.values());
    io.to(cleanRoomCode).emit('user-list-update', userList);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: cleanRoomCode,
        username: cleanUsername,
        userColor: userColor,
        history: room.messages,
        users: userList
      });
    }
  });

  // Handle sending chat messages
  socket.on('send-message', ({ text }) => {
    if (!currentRoom || !currentUsername || !text) return;

    const cleanText = text.trim();
    if (!cleanText) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const user = room.users.get(socket.id);
    const userColor = user ? user.color : '#4F46E5';

    const messageObj = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      username: currentUsername,
      text: cleanText,
      color: userColor,
      timestamp: new Date().toISOString(),
      system: false,
      type: 'text'
    };

    // Store message
    room.messages.push(messageObj);
    if (room.messages.length > 200) room.messages.shift();

    // Broadcast message to room
    io.to(currentRoom).emit('new-message', messageObj);
  });

  // Handle sending files and photos
  socket.on('send-file', (fileData) => {
    if (!currentRoom || !currentUsername || !fileData || !fileData.dataUrl) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const user = room.users.get(socket.id);
    const userColor = user ? user.color : '#4F46E5';

    const isImage = fileData.type && fileData.type.startsWith('image/');

    const messageObj = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      username: currentUsername,
      color: userColor,
      timestamp: new Date().toISOString(),
      system: false,
      type: isImage ? 'image' : 'file',
      fileName: fileData.name || 'attachment',
      fileSize: fileData.size || '',
      dataUrl: fileData.dataUrl
    };

    // Store message
    room.messages.push(messageObj);
    if (room.messages.length > 200) room.messages.shift();

    // Broadcast file/image to room
    io.to(currentRoom).emit('new-message', messageObj);
  });

  // Handle typing status
  socket.on('typing', ({ isTyping }) => {
    if (!currentRoom || !currentUsername) return;
    socket.to(currentRoom).emit('user-typing', {
      username: currentUsername,
      isTyping: Boolean(isTyping)
    });
  });

  // Explicit leave room request
  socket.on('leave-room', () => {
    leaveCurrentRoom(socket);
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });

  // Helper function to handle cleanup on room leave or disconnect
  function leaveCurrentRoom(sock) {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (room) {
      const user = room.users.get(sock.id);
      room.users.delete(sock.id);

      if (user) {
        const leaveMsg = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
          system: true,
          text: `${user.username} left the room`,
          timestamp: new Date().toISOString()
        };

        room.messages.push(leaveMsg);
        if (room.messages.length > 200) room.messages.shift();

        io.to(currentRoom).emit('new-message', leaveMsg);
        io.to(currentRoom).emit('user-list-update', Array.from(room.users.values()));
      }

      // Cleanup room if empty
      if (room.users.size === 0) {
        rooms.delete(currentRoom);
      }
    }

    sock.leave(currentRoom);
    currentRoom = null;
    currentUsername = null;
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Chatbox Server is running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
