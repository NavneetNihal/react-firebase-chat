import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CameraModal
// Opens the user's webcam, lets them take a photo, preview it, then send it
//
// Props:
//   onCapture(file, previewUrl) — called when user clicks "Send Photo"
//   onClose()                  — called when user closes the modal
//
// Flow:
//   1. getUserMedia() starts the live webcam feed
//   2. User clicks the capture button → canvas snapshots the video frame
//   3. Preview shown — user can Retake or Send
//   4. Send converts the canvas data URL → Blob → File and calls onCapture()
// ─────────────────────────────────────────────────────────────────────────────

const CameraModal = ({ onCapture, onClose }) => {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [captured,    setCaptured]    = useState(null);  // data URL of captured frame
  const [cameraError, setCameraError] = useState(null);

  // ── Start webcam on mount ──────────────────────────────────────────────────
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

  // ── Snapshot the current video frame onto canvas ───────────────────────────
  const handleCapture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);

    // Stop the stream while showing preview (saves battery/resources)
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  // ── Restart webcam for a fresh shot ───────────────────────────────────────
  const handleRetake = () => {
    setCaptured(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => setCameraError("Camera access failed."));
  };

  // ── Convert data URL → File and hand it back to Chat ─────────────────────
  const handleSend = () => {
    if (!captured) return;
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
          /* ── Preview captured photo ── */
          <div className="cameraPreview">
            <img src={captured} alt="Captured" className="capturedImg" />
            <div className="cameraActions">
              <button className="retakeBtn"    onClick={handleRetake}>↩ Retake</button>
              <button className="cameraSendBtn" onClick={handleSend}>Send Photo</button>
            </div>
          </div>
        ) : (
          /* ── Live webcam feed ── */
          <div className="cameraLive">
            <video ref={videoRef} className="cameraVideo" playsInline muted autoPlay />
            <button className="captureBtn" onClick={handleCapture}>
              <span className="captureRing" />
            </button>
          </div>
        )}

        {/* Hidden canvas — only used for snapshotting, never shown */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
};

export default CameraModal;
