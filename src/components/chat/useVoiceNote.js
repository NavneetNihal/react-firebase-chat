import { useRef, useState } from "react";
import { ID } from "appwrite";
import { Permission, Role } from "appwrite";
import { databases, appwriteConfig } from "../../lib/appwrite";
import upload from "../../lib/upload";
import useUserStore from "../../lib/userStore";
import { useChatStore } from "../../lib/chatStore";

// ─────────────────────────────────────────────────────────────────────────────
// useVoiceNote — all voice recording & sending logic in one place
//
// Usage in Chat.jsx:
//   const voiceNote = useVoiceNote();
//   <button onClick={voiceNote.handleMicClick} />
//   {voiceNote.isRecording && <RecordingBar ... />}
// ─────────────────────────────────────────────────────────────────────────────

const useVoiceNote = () => {
  const { currentUser } = useUserStore();
  const { chatId, user } = useChatStore();

  // ── State ──────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob]               = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl]   = useState(null);
  const [analyserNode, setAnalyserNode]         = useState(null);

  // ── Internal refs ──────────────────────────────────────────────────────────
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioContextRef   = useRef(null);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setRecordingDuration(0);

      // Wire up analyser for waveform visualisation
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      setAnalyserNode(analyser);

      // Start MediaRecorder
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

  // ── Stop recording (keeps the blob for preview/send) ──────────────────────
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // ── Cancel recording (discards everything) ─────────────────────────────────
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
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // ── Toggle: mic button click ───────────────────────────────────────────────
  const handleMicClick = () => {
    if (isRecording) stopRecording();
    else if (!audioBlob) startRecording();
  };

  // ── Send the recorded voice note to Appwrite ───────────────────────────────
  const sendVoiceNote = async () => {
    if (!audioBlob) return;

    const currentUserId = currentUser?.$id || currentUser?.id;
    const otherUserId   = user?.$id || user?.id;

    // Snapshot before clearing state (avoid stale closure issues)
    const voiceBlob       = audioBlob;
    const voicePreviewUrl = audioPreviewUrl;

    // Clear immediately so UI feels instant
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

      // Append voice message to chat document
      const chatDoc   = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId);
      const newMessage = JSON.stringify({ senderId: currentUserId, text: "", audio: audioUrl, createdAt: Date.now() });
      await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.chatsCollectionId, chatId, {
        messages: [...(chatDoc.messages || []), newMessage],
      });

      // Update both users' chat list entries
      for (const id of [currentUserId, otherUserId]) {
        try {
          const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userchatsCollectionId, id);
          if (doc?.chats) {
            const parsed = doc.chats
              .map((c) => { try { return typeof c === "string" ? JSON.parse(c) : c; } catch { return null; } })
              .filter(Boolean);
            const idx = parsed.findIndex((c) => c.chatId === chatId);
            if (idx !== -1) {
              parsed[idx].lastMessage = "🎤 Voice Note";
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
    } catch (err) {
      console.error("Error sending voice note:", err);
    } finally {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    }
  };

  // ── Cleanup (call this in Chat's useEffect cleanup) ────────────────────────
  const cleanup = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
  };

  return {
    // State — read these in JSX
    isRecording,
    recordingDuration,
    audioBlob,
    audioPreviewUrl,
    analyserNode,
    // Actions — call these from buttons
    handleMicClick,
    cancelRecording,
    sendVoiceNote,
    cleanup,
  };
};

export default useVoiceNote;
