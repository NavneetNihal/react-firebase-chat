# React Firebase Chat App (Powered by Appwrite)

An elegant, real-time chat application built with **React**, **Vite**, and **Appwrite**. Features user authentication, live chat syncing, image sharing, and dynamic user blocking.

---

## Tech Stack
- **Frontend**: React 18, Vite
- **Backend / BaaS**: Appwrite (Auth, Database, Storage)
- **State Management**: Zustand
- **Notifications**: React Toastify
- **Emoji**: emoji-picker-react

---

## Main Features
- **Real-Time Messaging**: Instant text and image message syncing via Appwrite Realtime.
- **Dynamic User Blocking**: Instantly block/unblock users. Updates the database and UI simultaneously without page refreshes.
- **Live Sidebar Sync**: Global chat list updates instantly when new messages arrive or when messages are left unread (Blue Dot feature).
- **Secure Image Uploads**: Profile avatars and chat images are uploaded directly to Appwrite Storage buckets.
- **Authentication**: Full email/password registration and login flow with session persistence.

---

## Core Engineering & Solved Pain Points

During development, we conquered several major architectural challenges and Appwrite-specific constraints:

### 1. Single-Bucket Zero-Trust File Security (RBAC)
**Pain Point:** Appwrite's free tier only allows one storage bucket, but the app needs to store both public avatars and strictly private chat images with completely different security rules.
**Solution:** Instead of managing multiple buckets, we implemented Role-Based Access Control (RBAC) at the file level during the exact moment of upload. The `upload.js` engine dynamically injects custom read/write permissions directly into the file payload. This ensures that even if a private chat image URL is leaked, the Appwrite backend will mechanically block any unauthorized user from viewing it.

### 2. The Appwrite Array Serialization Constraint
**Pain Point:** Appwrite's database does not support natively nesting complex JSON objects inside array fields (which we needed for `userchats` and `messages`).
**Solution:** We built a custom JSON serialization engine. Before uploading, the engine runs `JSON.stringify()` on every message object, converting it to a raw string. When downloading, the UI radar automatically runs `JSON.parse()` to re-inflate the strings back into usable JavaScript objects.

### 3. The Double-Loop Sidebar Sync
**Pain Point:** When a message is sent, the engine must update the left sidebar (`userchats`) for *both* the sender and the receiver, without causing database collisions.
**Solution:** We implemented a strict sequential `for...of` loop in `Chat.jsx`. It individually fetches the sender's sidebar, updates the preview text, uploads it, and *then* fetches the receiver's sidebar, flags it with an `isSeen: false` (Blue Dot), and uploads it. This guarantees zero data corruption.

### 4. The `getFileView` Storage Bug
**Pain Point:** Appwrite's `getFileView` API returned a complex URL object instead of a raw string, which corrupted the database payload.
**Solution:** We intercepted the storage pipeline in `upload.js` and forcefully appended `.toString()` to the `getFileView` result, ensuring the database only receives clean, permanent Cloud URLs.

### 5. Zero-Refresh Blocking System
**Pain Point:** Blocking a user traditionally required a full page refresh to properly re-sync the UI with the database.
**Solution:** We built a mechanical blocking engine in `Detail.jsx`. It uses high-speed array `.filter()` logic to block/unblock, fires the new array to the Appwrite database, and instantly overwrites the local `currentUser` memory vault using Zustand. This triggers an immediate React re-render, flipping the UI instantly without touching the network again.

---

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/NavneetNihal/react-firebase-chat.git
   cd react-firebase-chat
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Configure environment variables**
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
4. **Run the dev server**
   ```bash
   npm run dev
   ```

---
## License
MIT
