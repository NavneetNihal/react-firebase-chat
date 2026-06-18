# React Firebase Chat App

A real-time chat application built with **React**, **Vite**, and **Appwrite** as the backend. Features user authentication, live chat syncing, emoji support, and a custom file-level security architecture for private media storage.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Backend / BaaS | Appwrite (Auth, Database, Storage) |
| State Management | Zustand |
| Notifications | React Toastify |
| Emoji | emoji-picker-react |

---

## Features

- **Email/Password Authentication** — Register and login via Appwrite Account API
- **Avatar Upload on Registration** — Profile pictures uploaded to Appwrite Storage with public read permissions scoped at upload time
- **Real-time Chat List** — Subscribed to Appwrite Realtime so the chat list updates instantly when a new chat is added
- **Add User** — Search users by username and create a shared chat room between two users with duplicate-chat prevention
- **Emoji Picker** — Inline emoji picker integrated into the message input
- **Logout** — Session is destroyed via Appwrite and global state is cleared
- **Visual Loading States** — Spinner animations on async actions (login, register, add user)

---

## Architecture: Single-Bucket Zero-Trust File Security

One of the core infrastructure challenges was that Appwrite's free tier only allows **one storage bucket**. The app needed to store two types of media with completely different access levels:

- **Profile avatars** — publicly readable by anyone
- **Chat images** — private, accessible only to the sender and receiver

### Solution: File-Level RBAC at Upload Time

Rather than using multiple buckets or locking down the entire bucket globally, every file upload **dynamically assigns its own permission set** at the moment it is created.

**For avatars (registration flow):**
```js
const permissions = [
    Permission.read(Role.any()),           // Anyone can view avatars
    Permission.update(Role.user(res.$id)), // Only the owner can update
    Permission.delete(Role.user(res.$id))  // Only the owner can delete
];
imgUrl = await upload(avatar.file, permissions);
```

**For private chat images (planned/in progress):**
```js
const permissions = [
    Permission.read(Role.user(senderId)),   // Only sender can read
    Permission.read(Role.user(receiverId)), // Only receiver can read
];
```

This means:
- Even if the direct file URL for a private chat image is leaked, Appwrite's backend will reject the request from any unauthorized user ID.
- No secondary bucket management needed — the security boundary exists at the **file level, not the bucket level**.

---

## Database Schema (Appwrite)

### `users` collection
| Field | Type |
|---|---|
| `username` | string |
| `email` | string |
| `id` | string (same as Appwrite account `$id`) |
| `avatar` | string (storage file URL) |
| `blocked` | string[] |

### `userchats` collection
| Field | Type | Notes |
|---|---|---|
| `id` | string | Same as user `$id` |
| `chats` | string[] | Array of JSON stringified chat pointer objects |

Each chat pointer object (stringified):
```json
{
  "chatId": "...",
  "lastMessage": "...",
  "receiverId": "...",
  "updatedAt": 1234567890
}
```

### `chats` collection
| Field | Type |
|---|---|
| `messages` | string[] |

---

## Project Structure

```
src/
├── App.jsx                         # Root: auth gate, renders List/Chat/Detail or Login
├── index.css                       # Global styles
├── lib/
│   ├── appwrite.js                 # Appwrite client, config, exported services
│   ├── upload.js                   # Generic file upload helper with permission injection
│   └── userStore.js                # Zustand store: currentUser, isLoading, fetchUserInfo
└── components/
    ├── login/
    │   └── Login.jsx               # Register + Login forms, avatar upload, session handling
    ├── list/
    │   ├── List.jsx                # Composes UserInfo + ChatList
    │   ├── userInfo/
    │   │   └── Userinfo.jsx        # Logged-in user's avatar and username display
    │   └── chatList/
    │       ├── Chatlist.jsx        # Realtime chat list with Appwrite subscription
    │       └── addUser/
    │           └── AddUser.jsx     # Search users by username, create chat room
    ├── chat/
    │   └── Chat.jsx                # Chat window: messages, emoji picker, send input
    ├── detail/
    │   └── Detail.jsx              # Contact detail panel: shared photos, logout, block
    └── notification/
        └── Notification.jsx        # Global toast notification container
```

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/NavneetNihal/react-firebase-chat.git
cd react-firebase-chat
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root with your Appwrite project credentials:
```env
VITE_APPWRITE_URL=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=your_database_id
VITE_APPWRITE_USERS_COLLECTION_ID=your_users_collection_id
VITE_APPWRITE_CHATS_COLLECTION_ID=your_chats_collection_id
VITE_APPWRITE_USERCHATS_COLLECTION_ID=your_userchats_collection_id
VITE_APPWRITE_BUCKET_ID=your_bucket_id
```

### 4. Run the dev server
```bash
npm run dev
```

---

## Known Limitations / In Progress

- Chat messages (`Chat.jsx`) are currently static/placeholder — real-time message sending and rendering is not yet wired up to Appwrite
- Block user functionality is a UI placeholder — backend logic not yet implemented
- Chat images in messages do not yet use the file-level RBAC upload — this is planned

---

## License

MIT
