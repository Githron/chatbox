// ==========================================================================
// ChatBox Client App Logic
// ==========================================================================

const socket = io();

// State variables
let currentRoom = null;
let myUsername = null;
let myColor = '#6366F1';
let typingTimeout = null;
let isTyping = false;
let isUserAtBottom = true;
let selectedFile = null;

// Typing indicators: track who is currently typing (excluding ourselves)
const typingUsers = new Set();
const TYPING_TIMEOUT_MS = 5000;

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-code-input');
const usernameInput = document.getElementById('username-input');
const joinError = document.getElementById('join-error');
const joinBtn = document.querySelector('#join-form button[type="submit"]');

const currentRoomDisplay = document.getElementById('current-room-display');
const messagesContainer = document.getElementById('messages-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

const userList = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const mobileUserCount = document.getElementById('mobile-user-count');
const myAvatar = document.getElementById('my-avatar');
const myUsernameDisplay = document.getElementById('my-username-display');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// Emit typing events as the user types (debounced), stop on send/blur/timeout
function startTyping() {
  if (isTyping || !currentRoom) return;
  isTyping = true;
  socket.emit('typing', { isTyping: true });
}
function stopTyping() {
  if (!isTyping) return;
  isTyping = false;
  socket.emit('typing', { isTyping: false });
}
messageInput.addEventListener('input', () => {
  if (!currentRoom) return;
  if (messageInput.value.trim().length > 0) startTyping();
  else stopTyping();
});
messageInput.addEventListener('blur', stopTyping);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) stopTyping();
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 App Initialized");

  const urlParams = new URLSearchParams(window.location.search);
  const roomFromHash = window.location.hash.replace('#', '');
  const targetRoom = (urlParams.get('room') || roomFromHash || '').toUpperCase();

  if (targetRoom) roomInput.value = targetRoom;
  else generateRandomCode();

  // Handle stored session
  const savedRoom = localStorage.getItem('chatbox_room');
  const savedUser = localStorage.getItem('chatbox_username');

  if (savedRoom && savedUser) {
    console.log("♻️ Attempting auto-reconnect...");
    roomInput.value = targetRoom || savedRoom;
    usernameInput.value = savedUser;

    if (socket.connected) {
      joinRoom(true);
    } else {
      socket.once('connect', () => joinRoom(true));
    }
  } else if (targetRoom) {
    usernameInput.focus();
  }
});

function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  roomInput.value = code;
}

// JOIN ROOM
function joinRoom(isAutoReconnect = false) {
  const roomCode = roomInput.value.trim().toUpperCase();
  const username = usernameInput.value.trim();

  if (!roomCode || !username) {
    if (!isAutoReconnect) showError('Room code and username required.');
    return;
  }

  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.querySelector('span').textContent = 'Joining...';
  }

  socket.emit('join-room', { roomCode, username }, (response) => {
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.querySelector('span').textContent = 'Join Chat Room';
    }

    if (response && response.success) {
      currentRoom = response.roomCode;
      myUsername = response.username;
      myColor = response.userColor;

      localStorage.setItem('chatbox_room', currentRoom);
      localStorage.setItem('chatbox_username', myUsername);

      currentRoomDisplay.textContent = currentRoom;
      myUsernameDisplay.textContent = myUsername;
      setAvatar(myAvatar, myUsername, myColor);

      messagesList.innerHTML = '';
      if (response.history) {
        response.history.forEach(msg => renderMessage(msg));
      }

      updateUserList(response.users);
      window.history.pushState(null, '', `#${currentRoom}`);
      joinScreen.classList.remove('active');
      chatScreen.classList.add('active');

      scrollToBottom(false);
      messageInput.focus();
      if (!isAutoReconnect) showToast(`Welcome to ${currentRoom}!`);
    } else {
      if (isAutoReconnect) {
        localStorage.removeItem('chatbox_room');
        localStorage.removeItem('chatbox_username');
      } else {
        showError(response?.error || 'Could not join room.');
      }
    }
  });
}

function sendMessage() {
  if (selectedFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      socket.emit('send-file', {
        name: selectedFile.name,
        size: formatFileSize(selectedFile.size),
        type: selectedFile.type,
        dataUrl: e.target.result
      });
      selectedFile = null;
      updateInputPlaceholder();
    };
    reader.readAsDataURL(selectedFile);
    return;
  }

  const text = messageInput.value.trim();
  if (!text || !currentRoom) return;

  socket.emit('send-message', { text });
  messageInput.value = '';
  stopTyping();
}

function triggerFileUpload() { if (currentRoom) fileInput.click(); }

function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showToast('File too large (Max 5MB)');
  selectedFile = file;
  updateInputPlaceholder();
  showToast(`Staged: ${file.name}`);
}

function updateInputPlaceholder() {
  if (selectedFile) {
    messageInput.placeholder = `📎 Send: ${selectedFile.name}`;
    messageInput.style.fontStyle = 'italic';
  } else {
    messageInput.placeholder = 'Type a message...';
    messageInput.style.fontStyle = 'normal';
  }
}

function leaveRoom() {
  socket.emit('leave-room');
  currentRoom = null;
  myUsername = null;
  localStorage.removeItem('chatbox_room');
  localStorage.removeItem('chatbox_username');
  window.history.pushState(null, '', window.location.pathname);
  chatScreen.classList.remove('active');
  joinScreen.classList.add('active');
  showToast('Logged out');
}

function toggleSidebar() {
  if (sidebar && sidebarOverlay) {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
  }
}

// Attach event listeners to overlay and mobile buttons if they exist
document.addEventListener('click', (e) => {
  if (e.target.closest('.users-toggle-btn') || e.target.id === 'sidebar-overlay' || e.target.closest('.sidebar-header .icon-btn')) {
    toggleSidebar();
  }
});

// SOCKET EVENTS
socket.on('new-message', (msg) => renderMessage(msg));
socket.on('user-list-update', (users) => updateUserList(users));

// Server sends the full list of typing usernames; we hide our own name
socket.on('user-typing', (typingUsernames) => {
  typingUsers.clear();
  (typingUsernames || []).forEach((u) => typingUsers.add(u));
  renderTypingIndicator();
});

function renderTypingIndicator() {
  const names = Array.from(typingUsers).filter((u) => u !== myUsername);
  if (names.length === 0) {
    typingIndicator.classList.add('hidden');
    typingText.textContent = 'Someone is typing...';
    return;
  }
  let label;
  if (names.length === 1) label = `${names[0]} is typing...`;
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing...`;
  else label = `${names[0]}, ${names[1]} and ${names.length - 2} others are typing...`;
  typingText.textContent = label;
  typingIndicator.classList.remove('hidden');
}

socket.on('connect_error', (err) => {
  console.error("🔌 Socket Connection Error:", err);
  showToast("Connection lost. Reconnecting...");
});

// UI HELPERS
function renderMessage(msg) {
  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (msg.system) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `<span>${escapeHTML(msg.text)} • ${timeStr}</span>`;
    messagesList.appendChild(div);
  } else {
    const isSelf = msg.username.toLowerCase() === (myUsername || '').toLowerCase();
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isSelf ? 'self' : 'other'}`;

    const avatarHtml = !isSelf ? `<div class="avatar-sm" style="background-color: ${msg.color || '#6366F1'};">${getInitials(msg.username)}</div>` : '';
    const authorHtml = !isSelf ? `<span class="message-author" style="color: ${msg.color}">${escapeHTML(msg.username)}</span>` : '';

    let contentHtml = '';
    if (msg.type === 'image') {
      contentHtml = `<img src="${msg.dataUrl}" class="message-image" data-url="${escapeAttr(msg.dataUrl)}" data-name="${escapeAttr(msg.fileName || 'image')}" alt="Image" onclick="openImageModal(this)">`;
    } else if (msg.type === 'file') {
      contentHtml = `<a href="${msg.dataUrl}" download="${escapeHTML(msg.fileName)}" class="message-file-card"><i class="fa-solid fa-file"></i><div class="file-info"><span class="file-name">${escapeHTML(msg.fileName)}</span><span class="file-size">${msg.fileSize}</span></div></a>`;
    } else {
      contentHtml = `<div class="message-text">${escapeHTML(msg.text)}</div>`;
    }

    bubble.innerHTML = `${avatarHtml}<div class="message-content"><div class="message-header">${authorHtml}<span class="message-time">${timeStr}</span></div>${contentHtml}</div>`;
    messagesList.appendChild(bubble);
  }
  if (isUserAtBottom) scrollToBottom(true);
}

function updateUserList(users) {
  if (!users) return;
  userCount.textContent = users.length;
  if(mobileUserCount) mobileUserCount.textContent = users.length;
  userList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.className = 'user-item';
    const isMe = u.username.toLowerCase() === (myUsername || '').toLowerCase();
    li.innerHTML = `<div class="avatar-sm" style="background-color: ${u.color}">${getInitials(u.username)}</div><span>${escapeHTML(u.username)} ${isMe ? '(You)' : ''}</span>`;
    userList.appendChild(li);
  });
}

// SHARED UTILS
function scrollToBottom(smooth = true) {
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  isUserAtBottom = true;
}

function setAvatar(el, name, color) { el.style.backgroundColor = color; el.textContent = getInitials(name); }
function getInitials(n) { return n ? n.trim().slice(0, 2).toUpperCase() : '?'; }
function escapeHTML(s) { const p = document.createElement('p'); p.textContent = s; return p.innerHTML; }
function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Image modal / lightbox
function openImageModal(img) {
  const url = img.getAttribute('data-url');
  const name = img.getAttribute('data-name') || 'image';
  if (!url) return;
  document.getElementById('image-modal-img').src = url;
  const dl = document.getElementById('image-modal-download');
  dl.href = url;
  dl.download = name;
  document.getElementById('image-modal').classList.remove('hidden');
}
function closeImageModal() {
  document.getElementById('image-modal').classList.add('hidden');
  document.getElementById('image-modal-img').src = '';
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeImageModal();
});
function showError(m) { joinError.textContent = m; joinError.classList.remove('hidden'); }
function hideError() { joinError.classList.add('hidden'); }
function showToast(t) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = t;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
function formatFileSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
