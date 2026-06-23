import { useEffect, useRef, useState, useCallback } from "react";
import "./chat.css";
import EmojiPicker from "emoji-picker-react";
import { ID } from "appwrite";
import { client, databases, appwriteConfig } from "../../lib/appwrite";
import { Permission, Role } from "appwrite";
import { useChatStore } from "../../lib/chatStore";
import useUserStore from "../../lib/userStore";
import useCallStore from "../../lib/callStore";
import upload from "../../lib/upload";

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
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

// ─────────────────────────────────────────────
// WaveformCanvas: draws live amplitude bars
// ─────────────────────────────────────────────
const WaveformCanvas = ({ analyserNode }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyserNode) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const BAR_COUNT = 40;
    const BAR_GAP = 2;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const barWidth = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const step = Math.floor(bufferLength / BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j];
        const avg = sum / step;
        const barH = Math.max(3, (avg / 255) * H);
        const x = i * (barWidth + BAR_GAP);
        const y = (H - barH) / 2;
        const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
        gradient.addColorStop(0, `rgba(100,160,255,${0.5 + avg / 512})`);
        gradient.addColorStop(1, `rgba(81,131,254,${0.8 + avg / 768})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 3);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return <canvas ref={canvasRef} className="waveformCanvas" width={220} height={44} />;
};

// ─────────────────────────────────────────────
// CameraModal: live webcam capture
// ─────────────────────────────────────────────
const CameraModal = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [captured, setCaptured] = useState(null); // data URL of captured frame
  const [cameraError, setCameraError] = useState(null);

  // Start webcam stream
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch((err) => {
        console.error("Camera access denied:", err);
        setCameraError("Camera access was denied or is not available.");
      });
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
    // Stop video stream while previewing
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  const handleRetake = () => {
    setCaptured(null);
    // Restart stream
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch((err) => setCameraError("Camera access failed."));
  };

  const handleSend = () => {
    if (!captured) return;
    // Convert data URL to Blob then File
    const byteString = atob(captured.split(",")[1]);
    const mimeString = captured.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: mimeString });
    onCapture(file, captured);
    onClose();
  };

  return (
    <div className="cameraModal" onClick={onClose}>
      <div className="cameraModalContent" onClick={(e) => e.stopPropagation()}>
        <button className="cameraCloseBtn" onClick={onClose}>✕</button>

        {cameraError ? (
          <div className="cameraError">
            <p>{cameraError}</p>
            <button onClick={onClose}>Close</button>
          </div>
        ) : captured ? (
          /* ── Preview ── */
          <div className="cameraPreview">
            <img src={captured} alt="Captured" className="capturedImg" />
            <div className="cameraActions">
              <button className="retakeBtn" onClick={handleRetake}>↩ Retake</button>
              <button className="cameraSendBtn" onClick={handleSend}>Send Photo</button>
            </div>
          </div>
        ) : (
          /* ── Live feed ── */
          <div className="cameraLive">
            <video ref={videoRef} className="cameraVideo" playsInline muted autoPlay />
            <button className="captureBtn" onClick={handleCapture}>
              <span className="captureRing" />
            </button>
          </div>
        )}

        {/* Hidden canvas for snapshotting */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Chat component
// ─────────────────────────────────────────────
const Chat = () => {
  const [chat, setChat] = useState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [img, setImg] = useState({ file: null, url: "" });
  const [showCamera, setShowCamera] = useState(false);

  // Voice note state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const [analyserNode, setAnalyserNode] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioContextRef = useRef(null);

  const { currentUser } = useUserStore();
  const { chatId, user, isCurrentUserBlocked, isReceiverBlocked, toggleDetail, resetChat } = useChatStore();
  const { callState, initiateOutgoing } = useCallStore();

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const activeChatRef = useRef({ chatId, userId: user?.$id || user?.id });

  // ── Initiate a call ────────────────────────────────────────────────
  const handleCall = async (type) => {
    if (!user || isCurrentUserBlocked || isReceiverBlocked) return;
    if (callState !== "idle") return;
    if (!appwriteConfig.callsCollectionId) {
      alert("Calls collection not configured. Add VITE_APPWRITE_CALLS_COLLECTION_ID to .env");
      return;
    }
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId   = user?.$id || user?.id;

    if (!currentUserId || !otherUserId) {
      alert("Could not start call. User session is missing.");
      return;
    }

    try {
      const permissions = [
        Permission.read(Role.user(currentUserId)),
        Permission.read(Role.user(otherUserId)),
        Permission.update(Role.user(currentUserId)),
        Permission.update(Role.user(otherUserId)),
        Permission.delete(Role.user(currentUserId)),
      ];

      const callData = {
        callerId:   currentUserId,
        receiverId: otherUserId,
        callerName: (currentUser?.username || "Unknown").slice(0, 100),
        type,
        status:     "calling",
        ...(currentUser?.avatar ? { callerAvatar: currentUser.avatar.slice(0, 500) } : {}),
      };

      // Create the call signaling document in Appwrite
      let callDoc;
      try {
        callDoc = await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          ID.unique(),
          callData,
          permissions
        );
      } catch (permErr) {
        // Fallback: same pattern as chats collection (collection-level permissions)
        console.warn("Call create with document permissions failed, retrying:", permErr.message);
        callDoc = await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          ID.unique(),
          callData
        );
      }
      // Trigger outgoing call state
      initiateOutgoing(callDoc.$id, type, {
        id:     otherUserId,
        name:   user?.username || "Unknown",
        avatar: user?.avatar   || "",
      });
    } catch (err) {
      console.error("Failed to initiate call:", err);
      alert(
        `Could not start call.\n\n${err.message || err}\n\n` +
        "Check Appwrite → calls collection:\n" +
        "• Collection ID is exactly \"calls\"\n" +
        "• Attributes: callerId, receiverId, callerName, type, status (+ optional callerAvatar, offer, answer, callerIce, receiverIce)\n" +
        "• Permissions: Users → Create, Read, Update"
      );
    }
  };


  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

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

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Listen to other user's typing status (which is updated inside our userchats document)
  useEffect(() => {
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!currentUserId || !chatId) return;

    const loadInitialTyping = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userchatsCollectionId,
          currentUserId
        );
        if (doc?.chats) {
          const parsed = doc.chats.map((c) => {
            try { return typeof c === "string" ? JSON.parse(c) : c; }
            catch { return null; }
          }).filter(Boolean);
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
        const parsed = doc.chats.map((c) => {
          try { return typeof c === "string" ? JSON.parse(c) : c; }
          catch { return null; }
        }).filter(Boolean);
        const activeChat = parsed.find((c) => c.chatId === chatId);
        setIsOtherUserTyping(!!activeChat?.typing);
      }
    });

    return () => unsub();
  }, [chatId, currentUser]);

  useEffect(() => {
    const prev = activeChatRef.current;
    return () => {
      if (prev.chatId && prev.userId && isTypingRef.current) {
        const prevChatId = prev.chatId;
        const prevUserId = prev.userId;
        const turnOffTyping = async () => {
          try {
            const doc = await databases.getDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userchatsCollectionId,
              prevUserId
            );
            if (doc?.chats) {
              const parsed = doc.chats.map((c) => {
                try { return typeof c === "string" ? JSON.parse(c) : c; }
                catch { return null; }
              }).filter(Boolean);
              const idx = parsed.findIndex((c) => c.chatId === prevChatId);
              if (idx !== -1 && parsed[idx].typing) {
                parsed[idx].typing = false;
                await databases.updateDocument(
                  appwriteConfig.databaseId,
                  appwriteConfig.userchatsCollectionId,
                  prevUserId,
                  { chats: parsed.map((c) => JSON.stringify(c)) }
                );
                console.log("Turned off typing for previous chat:", prevChatId);
              }
            }
          } catch (e) {
            console.warn("Failed to reset typing status on unmount/swap:", e);
          }
        };
        turnOffTyping();
      }
    };
  }, [chatId, user]);

  useEffect(() => {
    activeChatRef.current = { chatId, userId: user?.$id || user?.id };
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
  }, [chatId, user]);

  const updateTypingStatus = async (typingVal) => {
    const otherUserId = user?.$id || user?.id;
    const currentUserId = currentUser?.$id || currentUser?.id;
    if (!otherUserId || !chatId || !currentUserId) return;

    try {
      const doc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userchatsCollectionId,
        otherUserId
      );
      if (doc?.chats) {
        const parsed = doc.chats.map((c) => {
          try { return typeof c === "string" ? JSON.parse(c) : c; }
          catch { return null; }
        }).filter(Boolean);

        const idx = parsed.findIndex((c) => c.chatId === chatId);
        if (idx !== -1) {
          if (parsed[idx].typing === typingVal) return;
          parsed[idx].typing = typingVal;
          await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userchatsCollectionId,
            otherUserId,
            { chats: parsed.map((c) => JSON.stringify(c)) }
          );
        }
      }
    } catch (err) {
      console.warn("Error updating typing status:", err.message);
    }
  };

  const handleInputChange = (e) => {
    setText(e.target.value);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      updateTypingStatus(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      updateTypingStatus(false);
    }, 1800);
  };

  const handleEmoji = (e) => setText((prev) => prev + e.emoji);

  const handleImg = (e) => {
    if (e.target.files[0]) {
      setImg({ file: e.target.files[0], url: URL.createObjectURL(e.target.files[0]) });
    }
  };

  // Called by CameraModal when user clicks Send Photo
  const handleCameraCapture = (file, previewUrl) => {
    setImg({ file, url: previewUrl });
  };

  // ─── VOICE NOTE RECORDING ─────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setRecordingDuration(0);

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      setAnalyserNode(analyser);

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        setAnalyserNode(null);
      };

      recorder.start();
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
      alert("Microphone access is required to record voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    setIsRecording(false);
    setAnalyserNode(null);
    setAudioBlob(null);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setRecordingDuration(0);
    audioChunksRef.current = [];
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const handleMicClick = () => {
    if (isRecording) stopRecording();
    else if (!audioBlob) startRecording();
  };

  const sendVoiceNote = async () => {
    if (!audioBlob) return;
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId = user?.$id || user?.id;

    const voiceBlob = audioBlob;
    const voicePreviewUrl = audioPreviewUrl;

    // Immediately clear state to update the UI instantly
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingDuration(0);
    audioChunksRef.current = [];

    try {
      const audioFile = new File([voiceBlob], "voicenote.webm", { type: "audio/webm" });
      const permissions = [
        Permission.read(Role.any()),
        Permission.update(Role.user(currentUserId)),
        Permission.delete(Role.user(currentUserId)),
      ];
      const audioUrl = await upload(audioFile, permissions);
      const chatDoc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
      const newMessage = JSON.stringify({ senderId: currentUserId, text: "", audio: audioUrl, createdAt: Date.now() });
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
              parsed[idx].lastMessage = "🎤 Voice Note";
              parsed[idx].isSeen = id === currentUserId;
              parsed[idx].updatedAt = Date.now();
              parsed[idx].typing = false; // always clear typing on send to prevent stuck indicator
              await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id, { chats: parsed.map((c) => JSON.stringify(c)) });
            }
          }
        } catch (err) { console.error(err); }
      }
    } catch (err) {
      console.error("Error sending voice note:", err);
    } finally {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    }
  };

  // ─── SEND TEXT / IMAGE ────────────────────

  const handleSend = async (e) => {
    e?.preventDefault();
    if (text === "" && !img.file) return;
    setOpen(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    updateTypingStatus(false);

    // Save states locally for the background requests
    const messageText = text;
    const imgFile = img.file;

    // Immediately clear inputs for a highly responsive UI
    setText("");
    setImg({ file: null, url: "" });
    setOpen(false);

    let imgUrl = null;
    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId = user?.$id || user?.id;

    try {
      if (imgFile) imgUrl = await upload(imgFile);
      const chatDoc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
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
              parsed[idx].isSeen = id === currentUserId;
              parsed[idx].updatedAt = Date.now();
              parsed[idx].typing = false; // always clear typing on send to prevent stuck indicator
              await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id, { chats: parsed.map((c) => JSON.stringify(c)) });
            }
          }
        } catch (err) { console.error(err); }
      }
    } catch (err) {
      console.log("Error sending message:", err);
    }
  };

  const isBlocked = isCurrentUserBlocked || isReceiverBlocked;

  // ─── RENDER ───────────────────────────────

  return (
    <div className="chat">
      {showCamera && (
        <CameraModal
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

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
          <img
            src="./phone.png"
            alt="Voice call"
            title="Start voice call"
            style={{ cursor: "pointer" }}
            onClick={() => handleCall("audio")}
          />
          <img
            src="./video.png"
            alt="Video call"
            title="Start video call"
            style={{ cursor: "pointer" }}
            onClick={() => handleCall("video")}
          />
          <img src="./info.png" alt="" onClick={toggleDetail} style={{ cursor: "pointer" }} />
        </div>
      </div>

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
                {message.img && <img src={message.img} alt="" />}
                {message.audio && (
                  <div className="audioMessage">
                    <img src="./mic.png" alt="voice" className="micIcon" />
                    <audio controls src={message.audio} preload="metadata" />
                  </div>
                )}
                {message.text && <p>{message.text}</p>}
                <span>{formatTimeAgo(message.createdAt)}</span>
              </div>
            </div>
          );
        })}

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

        <div ref={endRef}></div>
      </div>

      {/* Active recording bar */}
      {isRecording && (
        <div className="recordingBar">
          <button className="voiceCancelBtn" onClick={cancelRecording} title="Cancel">✕</button>
          <span className="recDot"></span>
          <span className="recTimer">{formatDuration(recordingDuration)}</span>
          <WaveformCanvas analyserNode={analyserNode} />
          <button className="voiceStopBtn" onClick={stopRecording} title="Stop">⬛</button>
        </div>
      )}

      {/* Preview bar after stop */}
      {audioBlob && !isRecording && (
        <div className="voicePreviewBar">
          <button className="voiceCancelBtn" onClick={cancelRecording} title="Discard">✕</button>
          <div className="voicePreviewInner">
            <img src="./mic.png" alt="" className="micIcon" />
            <audio controls src={audioPreviewUrl} className="previewAudio" />
          </div>
          <button className="voiceSendBtn" onClick={sendVoiceNote}>Send</button>
        </div>
      )}

      <form className="bottom" onSubmit={handleSend}>
        <div className="icons">
          <label htmlFor="file">
            <img src="./img.png" alt="" />
          </label>
          <input type="file" id="file" style={{ display: "none" }} onChange={handleImg} />

          {/* Camera icon → opens webcam modal */}
          <img
            src="./camera.png"
            alt="Take photo"
            title="Take a photo"
            style={{ cursor: "pointer" }}
            onClick={() => !isBlocked && setShowCamera(true)}
          />

          <img
            src="./mic.png"
            alt="Record voice note"
            title={isRecording ? "Stop recording" : "Record voice note"}
            onClick={handleMicClick}
            style={{
              cursor: "pointer",
              filter: isRecording ? "drop-shadow(0 0 6px #ff4444) brightness(1.4)" : "none",
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
