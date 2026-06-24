import WaveformCanvas from "./WaveformCanvas";
import { formatDuration } from "./chatHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// VoiceNoteBar — UI for voice recording + preview states
//
// Renders one of two bars depending on what useVoiceNote returns:
//
//   RECORDING state:
//   [✕ cancel] [● 00:08] [~~ waveform ~~] [⬛ stop]
//
//   PREVIEW state (after stopping, before sending):
//   [✕ discard] [🎤 audio player] [Send]
//
// Props: spread the full voiceNote object from useVoiceNote()
//   isRecording      — boolean, is mic active?
//   recordingDuration — number of seconds recorded so far
//   analyserNode     — Web Audio AnalyserNode for WaveformCanvas
//   audioBlob        — Blob if recording stopped, null otherwise
//   audioPreviewUrl  — object URL for the <audio> preview player
//   cancelRecording  — () => void, cancel/discard
//   handleMicClick   — () => void, toggle record/stop
//   sendVoiceNote    — () => void, upload and send
//
// Usage in Chat.jsx:
//   const voiceNote = useVoiceNote();
//   <VoiceNoteBar {...voiceNote} />
// ─────────────────────────────────────────────────────────────────────────────

const VoiceNoteBar = ({
  isRecording,
  recordingDuration,
  analyserNode,
  audioBlob,
  audioPreviewUrl,
  cancelRecording,
  handleMicClick,
  sendVoiceNote,
}) => {
  // ── Nothing to show if not recording and no blob ready ────────────────────
  if (!isRecording && !audioBlob) return null;

  // ── Active recording bar ───────────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className="recordingBar">
        <button className="voiceCancelBtn" onClick={cancelRecording} title="Cancel">✕</button>
        <span className="recDot" />
        <span className="recTimer">{formatDuration(recordingDuration)}</span>
        <WaveformCanvas analyserNode={analyserNode} />
        <button className="voiceStopBtn" onClick={handleMicClick} title="Stop">⬛</button>
      </div>
    );
  }

  // ── Preview bar — recording stopped, ready to send or discard ─────────────
  return (
    <div className="voicePreviewBar">
      <button className="voiceCancelBtn" onClick={cancelRecording} title="Discard">✕</button>
      <div className="voicePreviewInner">
        <img src="./mic.png" alt="" className="micIcon" />
        <audio controls src={audioPreviewUrl} className="previewAudio" />
      </div>
      <button className="voiceSendBtn" onClick={sendVoiceNote}>Send</button>
    </div>
  );
};

export default VoiceNoteBar;
