import { useEffect, useRef, useState } from "react";
import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { databases, appwriteConfig, client } from "../../lib/appwrite";
import { useChatStore } from "../../lib/chatStore";
import useUserStore from "../../lib/userStore";
import upload from "../../lib/upload";

// ── Extracted components ──────────────────────────────────────────────────────
import CameraModal    from "./CameraModal";      // webcam capture modal
import WaveformCanvas from "./WaveformCanvas";   // live mic waveform bars

// ── Extracted hooks ───────────────────────────────────────────────────────────
import useVoiceNote      from "./useVoiceNote";       // all voice recording logic
import useCallInitiator  from "./useCallInitiator";   // clicking 📞/📹 buttons

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now  = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
};

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Chat — main chat window component
//
// Responsibilities (what lives HERE):
//   • Fetching + subscribing to chat messages
//   • Typing indicator (show/hide, update Appwrite)
//   • Sending text messages and images
//   • Rendering the message list, input bar, emoji picker
//
// Responsibilities (what lives ELSEWHERE):
//   • Voice recording → useVoiceNote.js
//   • Call initiation → useCallInitiator.js
//   • Camera capture  → CameraModal.jsx
//   • Waveform bars   → WaveformCanvas.jsx
//   • WebRTC logic    → CallOverlay.jsx
//   • Call state      → callStore.js
// ─────────────────────────────────────────────────────────────────────────────
const Chat = () => {
  const [chat,       setChat]       = useState();
  const [open,       setOpen]       = useState(false);
  const [text,       setText]       = useState("");
  const [img,        setImg]        = useState({ file: null, url: "" });
  const [showCamera, setShowCamera] = useState(false);

  const { currentUser }                                                      = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, toggleDetail, resetChat } = useChatStore();

  // ── Typing indicator ───────────────────────────────────────────────────────
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef      = useRef(false);
  const activeChatRef    = useRef({ chatId, userId: user?.$id || user?.id });

  // ── Pull in extracted feature hooks ───────────────────────────────────────
  const voiceNote = useVoiceNote();          // isRecording, audioBlob, handleMicClick, etc.
  const { handleCall } = useCallInitiator(); // handleCall("audio") / handleCall("video")

  const endRef = useRef(null);
  const isBlocked = isCurrentUserBlocked || isReceiverBlocked;

  // ── Scroll to bottom when messages change ──────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  // ── Fetch chat + subscribe to real-time message updates ───────────────────
  useEffect(() => {
    if (!chatId) return;

    const fetchChat = async () => {
      try {
        const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
        setChat(doc);
      } catch (err) {
        console.log("Error loading chat:", err);
      }
    };
    fetchChat();

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.chatsCollectionId}.documents.${chatId}`;
    const unSub = client.subscribe(channel, (response) => {
      if (
        response.events.some((e) => e.includes(".update")) ||
        response.events.some((e) => e.includes(".create"))
      ) {
        setChat(response.payload);
      }
    });
    return () => unSub();
  }, [chatId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      voiceNote.cleanup();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // ── Listen to other user's typing status in OUR userchats doc ─────────────
  useEffect(() => {
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!currentUserId || !chatId) return;

    const loadInitialTyping = async () => {
      try {
        const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, currentUserId);
        if (doc?.chats) {
          const parsed = doc.chats.map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } }).filter(Boolean);
          const activeChat = parsed.find((c) => c.chatId === chatId);
          setIsOtherUserTyping(!!activeChat?.typing);
        }
      } catch {}
    };
    loadInitialTyping();

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.userchatsCollectionId}.documents.${currentUserId}`;
    const unsub = client.subscribe(channel, (res) => {
      const doc = res.payload;
      if (doc?.chats) {
        const parsed = doc.chats.map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } }).filter(Boolean);
        const activeChat = parsed.find((c) => c.chatId === chatId);
        setIsOtherUserTyping(!!activeChat?.typing);
      }
    });
    return () => unsub();
  }, [chatId, currentUser]);

  // ── Clear our typing flag when switching chats ─────────────────────────────
  useEffect(() => {
    const prev = activeChatRef.current;
    return () => {
      if (prev.chatId && prev.userId && isTypingRef.current) {
        const prevChatId = prev.chatId;
        const prevUserId = prev.userId;
        (async () => {
          try {
            const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, prevUserId);
            if (doc?.chats) {
              const parsed = doc.chats.map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } }).filter(Boolean);
              const idx = parsed.findIndex((c) => c.chatId === prevChatId);
              if (idx !== -1 && parsed[idx].typing) {
                parsed[idx].typing = false;
                await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, prevUserId, {
                  chats: parsed.map((c) => JSON.stringify(c)),
                });
              }
            }
          } catch (e) { console.warn("Failed to reset typing on chat swap:", e); }
        })();
      }
    };
  }, [chatId, user]);

  useEffect(() => {
    activeChatRef.current = { chatId, userId: user?.$id || user?.id };
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    isTypingRef.current = false;
  }, [chatId, user]);

  // ── Update typing status in other user's userchats doc ────────────────────
  const updateTypingStatus = async (typingVal) => {
    const otherUserId   = user?.$id || user?.id;
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!otherUserId || !chatId || !currentUserId) return;
    try {
      const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, otherUserId);
      if (doc?.chats) {
        const parsed = doc.chats.map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } }).filter(Boolean);
        const idx = parsed.findIndex((c) => c.chatId === chatId);
        if (idx !== -1) {
          if (parsed[idx].typing === typingVal) return; // no change needed
          parsed[idx].typing = typingVal;
          await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, otherUserId, {
            chats: parsed.map((c) => JSON.stringify(c)),
          });
        }
      }
    } catch (err) { console.warn("Error updating typing status:", err.message); }
  };

  const handleInputChange = (e) => {
    setText(e.target.value);
    if (!isTypingRef.current) { isTypingRef.current = true; updateTypingStatus(true); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      updateTypingStatus(false);
    }, 1800);
  };

  // ── Send text / image ──────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault();
    if (text === "" && !img.file) return;
    setOpen(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    updateTypingStatus(false);

    const messageText   = text;
    const imgFile       = img.file;
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId   = user?.$id || user?.id;

    setText(""); setImg({ file: null, url: "" });

    try {
      let imgUrl = null;
      if (imgFile) imgUrl = await upload(imgFile);

      const chatDoc    = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
      const newMessage = JSON.stringify({ senderId: currentUserId, text: messageText, createdAt: Date.now(), ...(imgUrl && { img: imgUrl }) });
      await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId, {
        messages: [...(chatDoc.messages || []), newMessage],
      });

      for (const id of [currentUserId, otherUserId]) {
        try {
          const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id);
          if (doc?.chats) {
            const parsed = doc.chats.map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } }).filter(Boolean);
            const idx = parsed.findIndex((c) => c.chatId === chatId);
            if (idx !== -1) {
              parsed[idx].lastMessage = messageText || "[Image]";
              parsed[idx].isSeen      = id === currentUserId;
              parsed[idx].updatedAt   = Date.now();
              parsed[idx].typing      = false; // prevent stuck typing indicator
              await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id, {
                chats: parsed.map((c) => JSON.stringify(c)),
              });
            }
          }
        } catch (err) { console.error(err); }
      }
    } catch (err) { console.log("Error sending message:", err); }
  };

  const handleEmoji  = (e) => setText((prev) => prev + e.emoji);
  const handleImg    = (e) => { if (e.target.files[0]) setImg({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) }); };
  const handleCameraCapture = (file, previewUrl) => setImg({ file, url: previewUrl });

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="chat">
      {/* Camera modal — rendered only when open */}
      {showCamera && (
        <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      {/* ── Top bar: user info + call buttons ── */}
      <div className="top">
        <div className="backButton" onClick={resetChat}>
          <img src="./arrowDown.png" alt="Back" />
        </div>
        <div className="user" onClick={toggleDetail} style={{ cursor: "pointer" }}>
          <img src={user?.avatar || "./avatar.png"} alt="" />
          <div className="texts">
            <span>{user?.username || "User"}</span>
            <p style={{ color: isOtherUserTyping ? "#8bb2ff" : "#e0e0e0", fontWeight: isOtherUserTyping ? "bold" : "normal" }}>
              {isOtherUserTyping ? "💬 typing..." : (user?.status || "Available")}
            </p>
          </div>
        </div>
        <div className="icons">
          {/* These call useCallInitiator → handleCall → Appwrite doc → callStore → CallOverlay */}
          <img src="./phone.png" alt="Voice call"  title="Start voice call"  style={{ cursor: "pointer" }} onClick={() => handleCall("audio")} />
          <img src="./video.png" alt="Video call"  title="Start video call"  style={{ cursor: "pointer" }} onClick={() => handleCall("video")} />
          <img src="./info.png"  alt="Info"                                  style={{ cursor: "pointer" }} onClick={toggleDetail} />
        </div>
      </div>

      {/* ── Message list ── */}
      <div className="center">
        {chat?.messages?.map((msgStr, index) => {
          let message;
          try { message = typeof msgStr === "string" ? JSON.parse(msgStr) : msgStr; }
          catch { return null; }
          if (!message) return null;
          const isOwn = message.senderId === (currentUser?.$id || currentUser?.id);
          return (
            <div className={isOwn ? "message own" : "message"} key={index}>
              <div className="texts">
                {message.img   && <img src={message.img} alt="" />}
                {message.audio && (
                  <div className="audioMessage">
                    <img src="./mic.png" alt="voice" className="micIcon" />
                    <audio controls src={message.audio} preload="metadata" />
                  </div>
                )}
                {message.text  && <p>{message.text}</p>}
                <span>{formatTimeAgo(message.createdAt)}</span>
              </div>
            </div>
          );
        })}

        {/* Image preview before sending */}
        {img.url && (
          <div className="message own">
            <div className="texts">
              <img src={img.url} alt="" style={{ opacity: 0.6, border: "2px dashed #5183fe" }} />
              <p style={{ backgroundColor: "rgba(81,131,254,0.2)", color: "#5183fe", fontSize: "12px", marginTop: "5px", padding: "8px", textAlign: "center", borderRadius: "8px", fontWeight: "bold" }}>
                Preview — Click Send to upload
              </p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Active recording bar (from useVoiceNote) ── */}
      {voiceNote.isRecording && (
        <div className="recordingBar">
          <button className="voiceCancelBtn" onClick={voiceNote.cancelRecording} title="Cancel">✕</button>
          <span className="recDot" />
          <span className="recTimer">{formatDuration(voiceNote.recordingDuration)}</span>
          <WaveformCanvas analyserNode={voiceNote.analyserNode} />
          <button className="voiceStopBtn" onClick={() => voiceNote.handleMicClick()} title="Stop">⬛</button>
        </div>
      )}

      {/* ── Preview bar after stopping (from useVoiceNote) ── */}
      {voiceNote.audioBlob && !voiceNote.isRecording && (
        <div className="voicePreviewBar">
          <button className="voiceCancelBtn" onClick={voiceNote.cancelRecording} title="Discard">✕</button>
          <div className="voicePreviewInner">
            <img src="./mic.png" alt="" className="micIcon" />
            <audio controls src={voiceNote.audioPreviewUrl} className="previewAudio" />
          </div>
          <button className="voiceSendBtn" onClick={voiceNote.sendVoiceNote}>Send</button>
        </div>
      )}

      {/* ── Input bar ── */}
      <form className="bottom" onSubmit={handleSend}>
        <div className="icons">
          <label htmlFor="file">
            <img src="./img.png" alt="" />
          </label>
          <input type="file" id="file" style={{ display: "none" }} onChange={handleImg} />

          <img
            src="./camera.png"
            alt="Take photo"
            title="Take a photo"
            style={{ cursor: "pointer" }}
            onClick={() => !isBlocked && setShowCamera(true)}
          />

          {/* Mic — glows red when recording */}
          <img
            src="./mic.png"
            alt="Record voice note"
            title={voiceNote.isRecording ? "Stop recording" : "Record voice note"}
            onClick={voiceNote.handleMicClick}
            style={{
              cursor: "pointer",
              filter: voiceNote.isRecording ? "drop-shadow(0 0 6px #ff4444) brightness(1.4)" : "none",
              transition: "filter 0.2s",
            }}
          />
        </div>

        <input
          type="text"
          placeholder={isBlocked ? "You cannot send a message" : "Type a message..."}
          value={text}
          onChange={handleInputChange}
          disabled={isBlocked}
        />

        <div className="emoji">
          <img src="./emoji.png" alt="" onClick={() => setOpen((prev) => !prev)} />
          <div className="picker">
            <EmojiPicker open={open} onEmojiClick={handleEmoji} />
          </div>
        </div>

        <button type="submit" className="sendButton" disabled={isBlocked}>Send</button>
      </form>
    </div>
  );
};

export default Chat;
