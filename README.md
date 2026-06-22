# React Chat App (Powered by Appwrite)

An elegant, real-time chat application built with **React**, **Vite**, and **Appwrite**. Features user authentication, live chat syncing, voice notes, camera capture, image sharing, mobile responsiveness, and dynamic user profiles.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Backend / BaaS | Appwrite (Auth, Database, Realtime, Storage) |
| State Management | Zustand |
| Notifications | React Toastify |
| Emoji | emoji-picker-react |
| Audio | Web Audio API (AnalyserNode + MediaRecorder) |
| Camera | WebRTC `getUserMedia` + Canvas |

---

## Features

### 💬 Core Messaging
- **Real-Time Text Messaging** — Instant syncing via Appwrite Realtime subscriptions.
- **Image Sharing** — Upload and send photos directly in chat. Stored securely in Appwrite Storage.
- **Emoji Picker** — Full emoji panel built into the message input.
- **Blue Dot Unread Indicator** — Sidebar highlights unread chats automatically.

### 🎤 Voice Notes
- Click the **microphone icon** to start recording.
- A **live waveform visualizer** (40 animated bars driven by `AnalyserNode` + `requestAnimationFrame`) reacts to your actual voice amplitude in real time — like WhatsApp.
- Click **Stop** → preview the recording with an audio player before sending.
- Click **Send** → audio uploaded to Appwrite Storage, rendered as a `<audio>` bubble in both users' chat windows in real time.
- **Cancel** discards the recording and releases the mic.

### 📷 Camera Capture
- Click the **camera icon** to open a live webcam modal.
- Live video feed via `getUserMedia({ video: true })`.
- Click the **shutter button** to capture a still frame (snapshotted via `<canvas>`).
- **Preview** the photo, **Retake** if needed, or click **Send Photo**.
- Photo is uploaded to Appwrite Storage and sent through the exact same pipeline as regular images.

### 👤 User Profiles
- **Edit Profile** modal — change your avatar and username.
- **Status** — set a custom status (e.g. "Busy", "Available", "In a meeting") stored in the Appwrite `users` collection.
- Status shows in:
  - Your own sidebar (below your username)
  - The chat header when someone opens a chat with you
  - The detail/info panel on the right
- Avatar updates immediately in the sidebar via Zustand local state patch (no full re-fetch required).

### 📱 Mobile Responsive
- Full mobile-first layout using CSS media queries and dynamic class toggling.
- On mobile: the chat list, chat window, and detail panel stack into a single-panel view with back navigation.
- Back buttons navigate: Detail → Chat → Chat List.

### 🔒 Security & Blocking
- **Block / Unblock** users instantly — UI flips without a page refresh.
- **Delete Chat** — removes the chat from both users' lists and deletes the chat room document.
- **Zero-trust file security** — each uploaded file gets its own RBAC permissions set at upload time.

---

## Core Engineering & Solved Pain Points

### 1. Single-Bucket Zero-Trust File Security (RBAC)
**Problem:** Appwrite free tier = one storage bucket. Profile avatars need public read; chat images need private read (only sender + receiver).

**Solution:** `upload.js` dynamically injects per-file `Permission.read(Role.user(...))` permissions at upload time. Even if a private image URL leaks, Appwrite's backend blocks unauthorized access mechanically.

---

### 2. Appwrite Array Serialization Constraint
**Problem:** Appwrite doesn't support native nested JSON objects inside array fields — needed for `messages` and `userchats`.

**Solution:** Custom JSON serialization engine. Every message object is `JSON.stringify()`-ed before writing, and `JSON.parse()`-ed on read. All edge cases (malformed strings, null entries) are caught and filtered.

---

### 3. Double-Loop Sidebar Sync
**Problem:** Sending a message must update the sidebar (`userchats`) for both sender and receiver atomically.

**Solution:** Sequential `for...of` loop — fetches sender's sidebar, updates preview + `isSeen: true`, commits, then fetches receiver's sidebar, sets `isSeen: false` (Blue Dot), commits. Zero data collisions.

---

### 4. Live Waveform Visualizer (Web Audio API)
**Problem:** A plain timer bar doesn't tell you if the mic is actually picking up audio.

**Solution:** `AudioContext` → `AnalyserNode` (fftSize=256) → reads `getByteFrequencyData` per animation frame → renders 40 frequency-bucketed bars on `<canvas>` with a blue gradient that intensifies with amplitude. The pipeline runs in parallel with `MediaRecorder` so audio capture is unaffected.

---

### 5. Camera Capture via WebRTC + Canvas Snapshot
**Problem:** `<input type="file" capture>` is unreliable on desktop and gives no preview.

**Solution:** `getUserMedia({ video: true })` pipes into a `<video>` element. On capture, `ctx.drawImage(video)` stamps the current frame onto a hidden `<canvas>`, `toDataURL()` converts it to a preview image, and on send, a `Blob` → `File` conversion feeds into the existing `upload()` pipeline.

---

### 6. Appwrite Schema Fallback for Profile Updates
**Problem:** The `status` attribute may not exist in a user's Appwrite schema — the entire document update would be rejected, including avatar and username changes.

**Solution:** Two-phase update with isolated error handling:
1. Avatar upload has its own try/catch with a specific error toast.
2. Database update is attempted with `{ username, avatar, status }` first.
3. If Appwrite returns code `400` / "Unknown attribute", a fallback retries with only `{ username, avatar }`.
4. `updateCurrentUser()` in Zustand immediately patches local state so the sidebar updates visually regardless of DB result.

---

### 7. Instant Local State Patching (Zustand)
**Problem:** After a profile save, `fetchUserInfo` re-fetches from Appwrite — if it fails, `currentUser` is set to `null`, breaking the UI.

**Solution:** Added `updateCurrentUser(fields)` action to `userStore`. This synchronously merges new fields into the current user object in the Zustand store immediately after save. `fetchUserInfo` still runs in the background as a non-critical sync, but is wrapped in `.catch(() => {})` so it cannot crash the session.

---

## Appwrite Schema Requirements

### `users` collection attributes
| Key | Type | Required | Default |
|---|---|---|---|
| `username` | String | ✅ Yes | — |
| `email` | String | ✅ Yes | — |
| `id` | String | ✅ Yes | — |
| `avatar` | String | No | NULL |
| `blocked` | String[] | No | NULL |
| `status` | String | No | `Available` |

### `chats` collection attributes
| Key | Type | Notes |
|---|---|---|
| `messages` | String[] | JSON-serialized message objects |

### `userchats` collection attributes
| Key | Type | Notes |
|---|---|---|
| `chats` | String[] | JSON-serialized chat metadata |

### Storage Bucket
One bucket for all files. Per-file RBAC permissions are injected at upload time.

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
   Create a `.env` file in the root:
   ```env
   VITE_APPWRITE_URL=https://cloud.appwrite.io/v1
   VITE_APPWRITE_PROJECT_ID=your_project_id
   VITE_APPWRITE_DATABASE_ID=your_database_id
   VITE_APPWRITE_USERS_COLLECTION_ID=your_users_collection_id
   VITE_APPWRITE_CHATS_COLLECTION_ID=your_chats_collection_id
   VITE_APPWRITE_USERCHATS_COLLECTION_ID=your_userchats_collection_id
   VITE_APPWRITE_BUCKET_ID=your_bucket_id
   ```

4. **Add `status` attribute to your Appwrite `users` collection**
   - Appwrite Console → Databases → your DB → `users` collection → Attributes → Create attribute → String
   - Key: `status`, Size: `255`, Required: No, Default: `Available`

5. **Run the dev server**
   ```bash
   npm run dev
   ```

---

## License
MIT
