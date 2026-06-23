import { useEffect, useRef, useState, useCallback } from "react";
import { databases, appwriteConfig, client } from "../../lib/appwrite";
import useCallStore from "../../lib/callStore";
import "./call.css";

const RTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Web Audio API Ringtone Synthesizer
// 0kb footprint, CORS-free, offline-ready calling sounds
// ─────────────────────────────────────────────────────────────────────────
class RingtoneManager {
  constructor() {
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gain = null;
    this.interval = null;
  }

  startIncoming() {
    this.stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    const playRing = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      
      this.osc1 = this.ctx.createOscillator();
      this.osc2 = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();

      this.osc1.type = "sine";
      this.osc1.frequency.setValueAtTime(440, this.ctx.currentTime); 
      this.osc2.type = "sine";
      this.osc2.frequency.setValueAtTime(480, this.ctx.currentTime); 

      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.1);
      this.gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 1.2);
      this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.4);

      this.osc1.connect(this.gain);
      this.osc2.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.osc1.start();
      this.osc2.start();

      setTimeout(() => {
        try {
          this.osc1?.stop();
          this.osc2?.stop();
        } catch {}
      }, 1500);
    };

    playRing();
    this.interval = setInterval(playRing, 3000);
  }

  startOutgoing() {
    this.stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    const playRingback = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }

      this.osc1 = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();

      this.osc1.type = "sine";
      this.osc1.frequency.setValueAtTime(400, this.ctx.currentTime);

      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.1);
      this.gain.gain.setValueAtTime(0.08, this.ctx.currentTime + 1.5);
      this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.8);

      this.osc1.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.osc1.start();

      setTimeout(() => {
        try {
          this.osc1?.stop();
        } catch {}
      }, 2000);
    };

    playRingback();
    this.interval = setInterval(playRingback, 4000);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
    try {
      this.osc1?.stop();
      this.osc2?.stop();
    } catch {}
    this.osc1 = null;
    this.osc2 = null;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close();
    }
    this.ctx = null;
  }
}

const ringtone = new RingtoneManager();


const formatTime = (s) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

const CallOverlay = () => {
  const { callState, callId, callType, remoteUser, isInitiator, setActive, endCall } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceBufferRef = useRef([]);
  const iceTimerRef = useRef(null);
  const remoteIceQueueRef = useRef([]);
  const addedIceRef = useRef(new Set());
  const unsubRef = useRef(null);
  const durationRef = useRef(null);
  const handleEndRef = useRef(null);
  const answerAppliedRef = useRef(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [remoteReady, setRemoteReady] = useState(false);
  const [canAccept, setCanAccept] = useState(false);

  const cleanup = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    clearTimeout(iceTimerRef.current);
    clearInterval(durationRef.current);
    iceBufferRef.current = [];
    remoteIceQueueRef.current = [];
    addedIceRef.current = new Set();
    answerAppliedRef.current = false;
    setDuration(0);
    setRemoteReady(false);
    setCanAccept(false);
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  const processIceQueue = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    try {
      while (remoteIceQueueRef.current.length > 0) {
        const candidate = remoteIceQueueRef.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    } catch {}
  }, []);

  const addIceCandidates = useCallback(async (pc, jsonStr) => {
    if (!pc || !jsonStr) return;
    try {
      const candidates = JSON.parse(jsonStr);
      for (const candidate of candidates) {
        const key = JSON.stringify(candidate);
        if (addedIceRef.current.has(key)) continue;
        addedIceRef.current.add(key);

        if (!pc.remoteDescription) {
          remoteIceQueueRef.current.push(candidate);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      }
    } catch {}
  }, []);

  const flushIce = useCallback(async (initiator, cid) => {
    if (!cid || iceBufferRef.current.length === 0) return;
    const field = initiator ? "callerIce" : "receiverIce";
    try {
      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        cid,
        { [field]: JSON.stringify(iceBufferRef.current) }
      );
    } catch (err) {
      console.warn("ICE flush error:", err.message);
    }
  }, []);

  const handleEnd = useCallback(async (cid) => {
    try {
      const id = cid || callId;
      if (id) {
        const { callState: activeState } = useCallStore.getState();
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          id,
          { status: activeState === "incoming" ? "rejected" : "ended" }
        ).catch(() => {});
      }
    } catch {}
    cleanup();
    endCall();
  }, [callId, cleanup, endCall]);

  handleEndRef.current = handleEnd;

  const buildPC = useCallback((initiator, cid) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      iceBufferRef.current.push(e.candidate.toJSON());
      clearTimeout(iceTimerRef.current);
      iceTimerRef.current = setTimeout(() => flushIce(initiator, cid), 500);
    };

    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      }
      setRemoteReady(true);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setActive();
        durationRef.current = setInterval(() => setDuration((p) => p + 1), 1000);
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        handleEndRef.current?.(cid);
      }
    };

    return pc;
  }, [flushIce, setActive]);

  const getStream = async (type) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { width: 640, height: 480 } : false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
    return stream;
  };

  // Sync streams when DOM components mount/update
  useEffect(() => {
    if (callState === "active" || callState === "outgoing") {
      if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [callState, isCamOff]);

  useEffect(() => {
    if (remoteReady && remoteVideoRef.current && remoteStreamRef.current && !remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteReady, callState]);

  const subscribeCallDoc = useCallback((cid, initiator) => {
    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents.${cid}`;
    unsubRef.current = client.subscribe(channel, async (res) => {
      const doc = res.payload;
      const pc = pcRef.current;
      if (!doc || !pc) return;

      if (doc.status === "ended" || doc.status === "rejected") {
        cleanup();
        endCall();
        return;
      }

      if (initiator && doc.answer && !answerAppliedRef.current) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(doc.answer)));
          answerAppliedRef.current = true;
          await processIceQueue(pc);
        } catch (err) {
          console.warn("setRemoteDescription (answer):", err.message);
        }
      }

      if (!initiator && doc.callerIce) {
        await addIceCandidates(pc, doc.callerIce);
      }

      if (initiator && doc.receiverIce) {
        await addIceCandidates(pc, doc.receiverIce);
      }
    });
  }, [addIceCandidates, processIceQueue, cleanup, endCall]);

  // Wait for caller offer + watch for caller cancel while incoming
  useEffect(() => {
    if (callState !== "incoming" || !callId) return;

    let live = true;
    setCanAccept(false);

    const loadOffer = async () => {
      try {
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          callId
        );
        if (!live) return;
        if (doc.status === "ended" || doc.status === "rejected") {
          cleanup();
          endCall();
          return;
        }
        if (doc.offer) setCanAccept(true);
      } catch (err) {
        console.warn("Incoming call load error:", err.message);
      }
    };

    loadOffer();

    const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents.${callId}`;
    const unsub = client.subscribe(channel, (res) => {
      const doc = res.payload;
      if (!doc) return;
      if (doc.status === "ended" || doc.status === "rejected") {
        cleanup();
        endCall();
        return;
      }
      if (doc.offer) setCanAccept(true);
    });

    return () => {
      live = false;
      unsub();
    };
  }, [callState, callId, cleanup, endCall]);

  useEffect(() => {
    if (callState !== "outgoing" || !isInitiator || !callId) return;
    let live = true;

    (async () => {
      try {
        const stream = await getStream(callType);
        if (!live) return;
        const pc = buildPC(true, callId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          callId,
          { offer: JSON.stringify(offer) }
        );
        subscribeCallDoc(callId, true);
      } catch (err) {
        console.error("Outgoing call setup error:", err);
        if (live) {
          await handleEndRef.current?.(callId);
        }
      }
    })();

    return () => { live = false; };
  }, [callState, callId, isInitiator, callType, buildPC, subscribeCallDoc]);

  const handleAccept = async () => {
    if (!canAccept) return;
    // Set active immediately to render callScreen and mount local/remote video tags
    setActive();

    try {
      let doc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        callId
      );

      let attempts = 0;
      while (!doc.offer && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.callsCollectionId,
          callId
        );
        attempts += 1;
      }
      if (!doc.offer) throw new Error("Call offer not ready");

      const stream = await getStream(callType);
      const pc = buildPC(false, callId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(doc.offer)));
      await processIceQueue(pc);
      await addIceCandidates(pc, doc.callerIce);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        callId,
        { answer: JSON.stringify(answer), status: "accepted" }
      );
      subscribeCallDoc(callId, false);
    } catch (err) {
      console.error("Accept call error:", err);
      cleanup();
      endCall();
    }
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((p) => !p);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCamOff((p) => !p);
  };

  useEffect(() => {
    if (callState === "incoming") {
      ringtone.startIncoming();
    } else if (callState === "outgoing") {
      ringtone.startOutgoing();
    } else {
      ringtone.stop();
    }
    return () => {
      ringtone.stop();
    };
  }, [callState]);

  useEffect(() => () => cleanup(), [cleanup]);


  if (callState === "idle") return null;

  if (callState === "incoming") {
    return (
      <div className="incomingBanner">
        <img src={remoteUser?.avatar || "./avatar.png"} alt="" className="incomingAvatar" />
        <div className="incomingInfo">
          <span className="incomingName">{remoteUser?.name || "Unknown"}</span>
          <span className="incomingType">
            {canAccept
              ? (callType === "video" ? "📹 Video call" : "📞 Voice call")
              : "Connecting call…"}
          </span>
        </div>
        <div className="incomingBtns">
          <button className="declineBtn" onClick={() => handleEnd()} title="Decline">
            <img src="./endcall.png" alt="Decline" onError={(e) => { e.target.style.display = "none"; e.target.parentElement.textContent = "✕"; }} />
          </button>
          <button
            className="acceptBtn"
            onClick={handleAccept}
            title="Accept"
            disabled={!canAccept}
            style={{ opacity: canAccept ? 1 : 0.45, cursor: canAccept ? "pointer" : "not-allowed" }}
          >
            <img src="./phone.png" alt="Accept" onError={(e) => { e.target.style.display = "none"; e.target.parentElement.textContent = "✓"; }} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="callScreen">
      <video
        ref={remoteVideoRef}
        className={`remoteVideo ${remoteReady ? "visible" : ""}`}
        autoPlay
        playsInline
      />

      {!remoteReady && (
        <div className="callWaiting">
          <div className="avatarPulse">
            <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
            <img src={remoteUser?.avatar || "./avatar.png"} alt="" className="callAvatar" />
          </div>
          <p className="callerNameLarge">{remoteUser?.name || "Unknown"}</p>
          <p className="callStatusText">
            {callState === "outgoing" ? "Calling…" : "Connecting…"}
          </p>
        </div>
      )}

      {callState === "active" && (
        <div className="durationBadge">{formatTime(duration)}</div>
      )}

      {callType === "video" && (
        <div className="localPip">
          <video ref={localVideoRef} className="localVideo" autoPlay playsInline muted />
          {isCamOff && <div className="camOffOverlay">📷 Off</div>}
        </div>
      )}

      <div className="callControls">
        <button
          className={`ctrlBtn ${isMuted ? "ctrlActive" : ""}`}
          onClick={toggleMute}
          title={isMuted ? "Unmute" : "Mute"}
        >
          <span>{isMuted ? "🔇" : "🎤"}</span>
          <small>{isMuted ? "Unmute" : "Mute"}</small>
        </button>

        {callType === "video" && (
          <button
            className={`ctrlBtn ${isCamOff ? "ctrlActive" : ""}`}
            onClick={toggleCam}
            title="Toggle camera"
          >
            <span>{isCamOff ? "📷" : "📸"}</span>
            <small>{isCamOff ? "Cam Off" : "Camera"}</small>
          </button>
        )}

        <button className="endBtn" onClick={() => handleEnd()} title="End call">
          <span>📵</span>
          <small>End</small>
        </button>
      </div>
    </div>
  );
};

export default CallOverlay;
