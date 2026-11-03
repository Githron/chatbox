const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 10 * 1024 * 1024
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MEMORY_CACHE = new Map();

// Ensure data directory exists
async function initDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('✅ Data directory ready');
  } catch (err) {
    console.error('❌ Error creating data directory:', err);
  }
}
initDataDir();

app.use(express.static(path.join(__dirname, 'public')));

async function getRoomHistory(roomCode) {
  if (MEMORY_CACHE.has(roomCode)) return MEMORY_CACHE.get(roomCode);
  const safeCode = roomCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(DATA_DIR, `${safeCode}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const history = JSON.parse(data);
    MEMORY_CACHE.set(roomCode, history);
    return history;
  } catch (err) {
    return [];
  }
}

async function updateRoomHistory(roomCode, newMsg) {
  let history = await getRoomHistory(roomCode);
  history.push(newMsg);
  if (history.length > 300) history.shift();
  MEMORY_CACHE.set(roomCode, history);
  const safeCode = roomCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(DATA_DIR, `${safeCode}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('❌ Save error:', err);
  }
}

function generateUserColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

const activeRooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUsername = null;

  console.log(`🔌 New connection: ${socket.id}`);

  socket.on('join-room', async ({ roomCode, username }, callback) => {
    console.log(`📥 Join request: Room ${roomCode}, User ${username}`);
    try {
      if (!roomCode || !username) {
        return callback({ success: false, error: 'Room code and username required' });
      }

      const cleanRoomCode = roomCode.trim().toUpperCase();
      const cleanUsername = username.trim();

      if (!activeRooms.has(cleanRoomCode)) {
        activeRooms.set(cleanRoomCode, { users: new Map() });
      }
      const room = activeRooms.get(cleanRoomCode);

      // Check if username taken by another ACTIVE user
      const existingUsers = Array.from(room.users.values()).map(u => u.username.toLowerCase());
      if (existingUsers.includes(cleanUsername.toLowerCase())) {
        return callback({ success: false, error: 'Username already taken in this room' });
      }

      currentRoom = cleanRoomCode;
      currentUsername = cleanUsername;
      const userColor = generateUserColor(cleanUsername);

      socket.join(cleanRoomCode);
      room.users.set(socket.id, { username: cleanUsername, color: userColor });

      const history = await getRoomHistory(cleanRoomCode);

      const joinMsg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        system: true,
        text: `${cleanUsername} joined the room`,
        timestamp: new Date().toISOString()
      };

      await updateRoomHistory(cleanRoomCode, joinMsg);

      // Update everyone in the room
      io.to(cleanRoomCode).emit('new-message', joinMsg);
      io.to(cleanRoomCode).emit('user-list-update', Array.from(room.users.values()));

      console.log(`✅ ${cleanUsername} joined ${cleanRoomCode}`);

      callback({
        success: true,
        roomCode: cleanRoomCode,
        username: cleanUsername,
        userColor,
        history,
        users: Array.from(room.users.values())
      });
    } catch (err) {
      console.error('❌ Join Error:', err);
      callback({ success: false, error: 'Internal Server Error' });
    }
  });

  socket.on('send-message', async ({ text }) => {
    if (!currentRoom || !text) return;
    const room = activeRooms.get(currentRoom);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;

    const messageObj = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      username: currentUsername,
      text: text.trim(),
      color: user.color,
      timestamp: new Date().toISOString(),
      system: false,
      type: 'text'
    };

    await updateRoomHistory(currentRoom, messageObj);
    io.to(currentRoom).emit('new-message', messageObj);
  });

  socket.on('send-file', async (fileData) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(fileData.type)) return;

    const room = activeRooms.get(currentRoom);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;

    const messageObj = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      username: currentUsername,
      color: user.color,
      timestamp: new Date().toISOString(),
      system: false,
      type: fileData.type.startsWith('image/') ? 'image' : 'file',
      fileName: fileData.name,
      fileSize: fileData.size,
      dataUrl: fileData.dataUrl
    };

    await updateRoomHistory(currentRoom, messageObj);
    io.to(currentRoom).emit('new-message', messageObj);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });

  function leaveCurrentRoom(sock) {
    if (!currentRoom) return;
    const room = activeRooms.get(currentRoom);
    if (room) {
      room.users.delete(sock.id);
      if (room.users.size === 0) {
        activeRooms.delete(currentRoom);
        // We keep the history in MEMORY_CACHE and on disk
      } else {
        io.to(currentRoom).emit('user-list-update', Array.from(room.users.values()));
      }
    }
    sock.leave(currentRoom);
    currentRoom = null;
    currentUsername = null;
  }
});

server.listen(PORT, () => {
  console.log(`
  =========================================
  🚀 CHATBOX SERVER IS LIVE
  🏠 URL: http://localhost:${PORT}
  =========================================
  `);
});
