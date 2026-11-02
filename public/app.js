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

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-code-input');
const usernameInput = document.getElementById('username-input');
const joinError = document.getElementById('join-error');

const currentRoomDisplay = document.getElementById('current-room-display');
const messagesContainer = document.getElementById('messages-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

const userList = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const myAvatar = document.getElementById('my-avatar');
const myUsernameDisplay = document.getElementById('my-username-display');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// Check URL params / Hash on load to prefill room code
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromQuery = urlParams.get('room');
  const roomFromHash = window.location.hash.replace('#', '');

  const targetRoom = roomFromQuery || roomFromHash;
  if (targetRoom) {
    roomInput.value = targetRoom.toUpperCase();
    usernameInput.focus();
  } else {
    // Generate a default random code for quick start
    generateRandomCode();
  }
});

// Generate Random Room Code
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  roomInput.value = code;
}

// Join Room Handler
function joinRoom() {
  const roomCode = roomInput.value.trim().toUpperCase();
  const username = usernameInput.value.trim();

  if (!roomCode || !username) {
    showError('Please enter both room code and username.');
    return;
  }

  hideError();

  socket.emit('join-room', { roomCode, username }, (response) => {
    if (response && response.success) {
      currentRoom = response.roomCode;
      myUsername = response.username;
      myColor = response.userColor;

      // Update UI state
      currentRoomDisplay.textContent = currentRoom;
      myUsernameDisplay.textContent = myUsername;
      setAvatar(myAvatar, myUsername, myColor);

      // Render room history
      messagesList.innerHTML = '';
      if (response.history && response.history.length > 0) {
        response.history.forEach(msg => renderMessage(msg));
      }

      // Update users
      updateUserList(response.users);

      // Update URL hash without reload
      window.history.pushState(null, '', `#${currentRoom}`);

      // Switch screens
      joinScreen.classList.remove('active');
      chatScreen.classList.add('active');

      scrollToBottom(false);
      messageInput.focus();
      showToast(`Joined room ${currentRoom}`);
    } else {
      showError(response.error || 'Failed to join room.');
    }
  });
}

// Send Message
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoom) return;

  socket.emit('send-message', { text });
  messageInput.value = '';
  stopTyping();
}

// Leave Room
function leaveRoom() {
  if (currentRoom) {
    socket.emit('leave-room');
    currentRoom = null;
    myUsername = null;
  }

  // Clear URL hash
  window.history.pushState(null, '', window.location.pathname);

  // Switch screens
  chatScreen.classList.remove('active');
  joinScreen.classList.add('active');
  hideError();
  showToast('Left room');
}

// Render Message
function renderMessage(msg) {
  if (msg.system) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'system-message';
    sysDiv.innerHTML = `<span>${escapeHTML(msg.text)} • ${msg.timestamp}</span>`;
    messagesList.appendChild(sysDiv);
  } else {
    const isSelf = msg.username.toLowerCase() === myUsername?.toLowerCase();

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isSelf ? 'self' : 'other'}`;

    const avatarHtml = !isSelf ? `
      <div class="avatar-sm" style="background-color: ${msg.color || '#6366F1'};">
        ${getInitials(msg.username)}
      </div>
    ` : '';

    const authorHtml = !isSelf ? `<span class="message-author" style="color: ${msg.color}">${escapeHTML(msg.username)}</span>` : '';

    bubble.innerHTML = `
      ${avatarHtml}
      <div class="message-content">
        <div class="message-header">
          ${authorHtml}
          <span class="message-time">${msg.timestamp}</span>
        </div>
        <div class="message-text">${escapeHTML(msg.text)}</div>
      </div>
    `;

    messagesList.appendChild(bubble);
  }

  if (isUserAtBottom) {
    scrollToBottom(true);
  } else {
    scrollBottomBtn.classList.remove('hidden');
  }
}

// Socket Event Listeners
socket.on('new-message', (msg) => {
  renderMessage(msg);
});

socket.on('user-list-update', (users) => {
  updateUserList(users);
});

socket.on('user-typing', ({ username, isTyping: typing }) => {
  if (typing) {
    typingText.textContent = `${username} is typing...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

// Update User List Sidebar
function updateUserList(users) {
  if (!users) return;
  userCount.textContent = users.length;
  userList.innerHTML = '';

  users.forEach(u => {
    const li = document.createElement('li');
    li.className = 'user-item';
    const isMe = u.username.toLowerCase() === myUsername?.toLowerCase();

    li.innerHTML = `
      <div class="avatar-sm" style="background-color: ${u.color}">
        ${getInitials(u.username)}
      </div>
      <span>${escapeHTML(u.username)} ${isMe ? '(You)' : ''}</span>
    `;
    userList.appendChild(li);
  });
}

// Typing Indicator Handler
messageInput.addEventListener('input', () => {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { isTyping: true });
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    stopTyping();
  }, 2000);
});

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit('typing', { isTyping: false });
  }
}

// Scroll Handling
messagesContainer.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  isUserAtBottom = distanceFromBottom < 50;

  if (isUserAtBottom) {
    scrollBottomBtn.classList.add('hidden');
  }
});

function scrollToBottom(smooth = true) {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
  isUserAtBottom = true;
  scrollBottomBtn.classList.add('hidden');
}

// Copy Utilities
function copyRoomCode() {
  if (!currentRoom) return;
  navigator.clipboard.writeText(currentRoom).then(() => {
    showToast(`Room code ${currentRoom} copied!`);
  });
}

function copyShareLink() {
  if (!currentRoom) return;
  const link = `${window.location.origin}${window.location.pathname}#${currentRoom}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Direct room link copied to clipboard!');
  });
}

// Mobile Sidebar Toggle
function toggleSidebar() {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
}

// Helpers
function setAvatar(element, name, color) {
  element.style.backgroundColor = color || '#6366F1';
  element.textContent = getInitials(name);
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().slice(0, 2).toUpperCase();
}

function escapeHTML(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

function showError(msg) {
  joinError.textContent = msg;
  joinError.classList.remove('hidden');
}

function hideError() {
  joinError.classList.add('hidden');
}

function showToast(text) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
