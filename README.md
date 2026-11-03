# ChatBox 💬

An instant, real-time group chat application requiring **no login or sign-up**. Anyone with a room code can join, choose a username, and start chatting immediately!

---

## 🌟 Key Features

- **No Login / Account Required**: Users only need a room code and a temporary username.
- **Room Code Group Chat**: Join existing rooms or create custom room codes (e.g. `LOBBY123`).
- **Shareable Direct Links**: Joining via `http://localhost:3000/#ROOMCODE` automatically prefills the room code.
- **Real-Time Messaging**: Built on Socket.IO for instant message delivery and live updates.
- **Live User List**: See everyone currently connected to your chat room.
- **Typing Indicators**: Visual feedback when group members are typing.
- **Sleek Modern UI**: Responsive, dark-themed interface built with glassmorphism touches and mobile support.
- **Message History**: Stores recent room conversation history for newly joined members.

---

## 🚀 Quick Start Instructions

### 1. Install Dependencies
Open your terminal in the `chatbox` directory and install the packages:

```bash
cd chatbox
npm install
```

### 2. Start the Server

```bash
npm start
```

Or for development mode with auto-reload:

```bash
npm run dev
```

### 3. Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🎮 How to Use

1. **Enter or Generate a Room Code** (e.g. `FRIENDS`, `TEAM12`, or click the 🎲 dice icon).
2. **Type your Username** (e.g., `Alex`, `Sam`).
3. Click **Join Chat Room**.
4. Share the **Room Code** or click **Share Link** to invite anyone to your group chat!

---

## 📂 Data Storage
Chat history is saved locally so people who join later can see recent messages. Each room gets its own file in `data/` (e.g. `data/LOBBY123.json`), capped at the last 300 messages per room.

These files are created at runtime and are **not** part of the repository — they're ignored by git and meant to live on the machine running the server. Old room files are automatically deleted after 7 days.

## 🛠️ Tech Stack
- **Backend:** Node.js + Express 4 + Socket.IO 4 (real-time WebSocket chat)
- **Frontend:** Vanilla HTML / CSS / JavaScript (no build step)
- **Persistence:** One JSON file per room, with an in-memory cache
- **Icons:** FontAwesome 6.5.1 (CDN)
