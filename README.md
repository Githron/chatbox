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
