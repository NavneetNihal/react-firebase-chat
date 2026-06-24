import { useEffect, useRef, useState } from "react";
import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { databases, appwriteConfig, client } from "../../lib/appwrite";
import { useChatStore } from "../../lib/chatStore";
import useUserStore from "../../lib/userStore";
import upload from "../../lib/upload";

// ── Components ────────────────────────────────────────────────────────────────
import CameraModal  from "./CameraModal";    // webcam capture modal
import VoiceNoteBar from "./VoiceNoteBar";   // recording + preview bars

// ── Custom hooks ──────────────────────────────────────────────────────────────
import useVoiceNote     from "./useVoiceNote";      // mic recording logic
import useCallInitiator from "./useCallInitiator";  // 📞/📹 button logic
import useTypingStatus  from "./useTypingStatus";   // typing indicator logic

// ── Helpers ───────────────────────────────────────────────────────────────────
import { formatTimeAgo } from "./chatHelpers"; // timestamp → "5m ago"

// ─────────────────────────────────────────────────────────────────────────────
// Chat — what belongs here:
//   ✅ Fetching + subscribing to chat messages (core job)
//   ✅ Sending text messages and images (core job)
//   ✅ Rendering message list, input bar, emoji picker (core job)
//
// What lives ELSEWHERE:
//   📁 useTypingStatus.js  — typing indicator (incoming + outgoing)
//   📁 useVoiceNote.js     — voice recording, preview, send
//   📁 useCallInitiator.js — clicking 📞/📹 → Appwrite → CallOverlay
//   📁 VoiceNoteBar.jsx    — recording UI bars
//   📁 CameraModal.jsx     — webcam capture
//   📁 WaveformCanvas.jsx  — live mic frequency bars
//   📁 CallOverlay.jsx     — WebRTC (in /call folder)
//   📁 callStore.js        — call state machine
//   📁 chatHelpers.js      — pure formatting utils
// ─────────────────────────────────────────────────────────────────────────────
const Chat = () => {
  const [chat,       setChat]       = useState();
  const [open,       setOpen]       = useState(false);
  const [text,       setText]       = useState("");
  const [img,        setImg]        = useState({ file: null, url: "" });
  const [showCamera, setShowCamera] = useState(false);

  const { currentUser } = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, toggleDetail, resetChat } = useChatStore();

  // ── Feature hooks (all logic lives in their own files) ────────────────────
  const voiceNote              = useVoiceNote();
  const { handleCall }         = useCallInitiator();
  const { isOtherUserTyping,
          handleInputChange,
          clearTyping }        = useTypingStatus();

  const endRef    = useRef(null);
  const isBlocked = isCurrentUserBlocked || isReceiverBlocked;

  // ── Scroll to latest message ───────────────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  // ── Fetch messages + subscribe to real-time updates ───────────────────────
  useEffect(() => {
    if (!chatId) return;

    const fetchChat = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.chatsCollectionId,
          chatId
        );
        setChat(doc);
      } catch (err) { console.log("Error loading chat:", err); }
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
    return () => voiceNote.cleanup();
  }, []);

  // ── Send text / image ──────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault();
    if (text === "" && !img.file) return;
    setOpen(false);

    // Kill typing indicator immediately on send
    clearTyping();

    const messageText   = text;
    const imgFile       = img.file;
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId   = user?.$id || user?.id;

    // Clear inputs immediately for snappy UI
    setText(""); setImg({ file: null, url: "" });

    try {
      let imgUrl = null;
      if (imgFile) imgUrl = await upload(imgFile);

      const chatDoc    = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
      const newMessage = JSON.stringify({
        senderId:  currentUserId,
        text:      messageText,
        createdAt: Date.now(),
        ...(imgUrl && { img: imgUrl }),
      });
      await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId, {
        messages: [...(chatDoc.messages || []), newMessage],
      });

      // Update both users' chat list metadata
      for (const id of [currentUserId, otherUserId]) {
        try {
          const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id);
          if (doc?.chats) {
            const parsed = doc.chats
              .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
              .filter(Boolean);
            const idx = parsed.findIndex((c) => c.chatId === chatId);
            if (idx !== -1) {
              parsed[idx].lastMessage = messageText || "[Image]";
              parsed[idx].isSeen      = id === currentUserId;
              parsed[idx].updatedAt   = Date.now();
              parsed[idx].typing      = false; // force-clear to prevent stuck indicator
              await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id, {
                chats: parsed.map((c) => JSON.stringify(c)),
              });
            }
          }
        } catch (err) { console.error(err); }
      }
    } catch (err) { console.log("Error sending message:", err); }
  };

  const handleEmoji         = (e) => setText((prev) => prev + e.emoji);
  const handleImg           = (e) => { if (e.target.files[0]) setImg({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) }); };
  const handleCameraCapture = (file, previewUrl) => setImg({ file, url: previewUrl });

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="chat">

      {/* Camera modal */}
      {showCamera && (
        <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      {/* ── Top bar ── */}
      <div className="top">
        <div className="backButton" onClick={resetChat}>
          <img src="./arrowDown.png" alt="Back" />
        </div>
        <div className="user" onClick={toggleDetail} style={{ cursor: "pointer" }}>
          <img src={user?.avatar || "./avatar.png"} alt="" />
          <div className="texts">
            <span>{user?.username || "User"}</span>
            {/* isOtherUserTyping comes from useTypingStatus */}
            <p style={{ color: isOtherUserTyping ? "#8bb2ff" : "#e0e0e0", fontWeight: isOtherUserTyping ? "bold" : "normal" }}>
              {isOtherUserTyping ? "💬 typing..." : (user?.status || "Available")}
            </p>
          </div>
        </div>
        <div className="icons">
          {/* handleCall comes from useCallInitiator */}
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
                {/* formatTimeAgo lives in chatHelpers.js */}
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

      {/* ── Voice recording / preview bars (from VoiceNoteBar + useVoiceNote) ── */}
      <VoiceNoteBar {...voiceNote} />

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

          {/* Mic glows red when recording */}
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
          onChange={(e) => handleInputChange(e, setText)}
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
