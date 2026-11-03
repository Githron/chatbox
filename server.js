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

// A room code is 1-20 chars of [A-Z0-9_-] after trimming + uppercasing.
// Anything else is rejected upstream so it can never become a junk filename.
const ROOM_CODE_RE = /^[A-Z0-9_-]{1,20}$/;

function isValidRoomCode(code) {
  return typeof code === 'string' && ROOM_CODE_RE.test(code.trim().toUpperCase());
}

// Map a validated room code to its on-disk filename (defense in depth).
function safeRoomFileName(roomCode) {
  return roomCode.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

async function getRoomHistory(roomCode) {
  if (MEMORY_CACHE.has(roomCode)) return MEMORY_CACHE.get(roomCode);
  const filePath = path.join(DATA_DIR, safeRoomFileName(roomCode));
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
  const filePath = path.join(DATA_DIR, safeRoomFileName(roomCode));
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

// Periodically delete room-history files older than 7 days so the data/
// directory does not grow without bound. Runs once on startup and then
// every 24 hours. Never touches files for rooms that are currently active.
const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function cleanupOldRoomFiles() {
  let entries;
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch (err) {
    console.error('❌ Cleanup: could not read data directory:', err);
    return;
  }

  const now = Date.now();
  let deleted = 0;
  for (const fileName of entries) {
    if (!fileName.endsWith('.json')) continue;
    const roomCode = fileName.replace(/\.json$/, '');
    if (activeRooms.has(roomCode)) continue; // don't delete an active room's file
    const filePath = path.join(DATA_DIR, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > CLEANUP_AGE_MS) {
        await fs.unlink(filePath);
        MEMORY_CACHE.delete(roomCode);
        deleted++;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('❌ Cleanup: could not process', fileName, err);
    }
  }
  if (deleted > 0) console.log(`🧹 Cleanup: removed ${deleted} room-history file(s) older than 7 days`);
}

// First run is delayed so browsers can auto-reconnect and mark their rooms
// active before any file is considered for deletion.
setTimeout(cleanupOldRoomFiles, 30000);
setInterval(cleanupOldRoomFiles, CLEANUP_INTERVAL_MS);

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

      if (!isValidRoomCode(cleanRoomCode)) {
        return callback({ success: false, error: 'Invalid room code' });
      }

      if (!activeRooms.has(cleanRoomCode)) {
        activeRooms.set(cleanRoomCode, { users: new Map(), typing: new Set() });
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
    });

    socket.on('leave-room', () => {
      leaveCurrentRoom(socket);
      // Broadcast that the user left the room
      io.to(currentRoom).emit('new-message', {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        system: true,
        text: `${currentUsername} left the room`,
        timestamp: new Date().toISOString()
      });
    });

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

  // Typing indicator: track who is typing per room and relay the list to others.
  // Auto-stops after a timeout so a dropped event never leaves someone "typing" forever.
  socket.on('typing', ({ isTyping }) => {
    if (!currentRoom) return;
    const room = activeRooms.get(currentRoom);
    if (!room) return;
    if (isTyping) {
      room.typing.add(currentUsername);
      if (room._typingTimeout) clearTimeout(room._typingTimeout);
      room._typingTimeout = setTimeout(() => {
        room.typing.delete(currentUsername);
        io.to(currentRoom).emit('user-typing', Array.from(room.typing));
      }, 5000);
    } else {
      room.typing.delete(currentUsername);
      if (room._typingTimeout) clearTimeout(room._typingTimeout);
    }
    // Broadcast the full list; each client hides its own name when rendering
    io.to(currentRoom).emit('user-typing', Array.from(room.typing));
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
        // A departing user should not linger as "typing"
        room.typing.delete(currentUsername);
        if (room._typingTimeout) clearTimeout(room._typingTimeout);
        const list = Array.from(room.typing).filter(u => u !== currentUsername);
        io.to(currentRoom).emit('user-typing', list);
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
