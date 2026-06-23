let notificationAudio = null;
let audioCtx = null;
let isUnlocked = false;

export const initAndUnlockAudio = () => {
  if (typeof window === "undefined" || notificationAudio) return;

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => {
      initAndUnlockAudio();
    });
    return;
  }

  // 1. Create/find HTML5 Audio element
  let audioEl = document.getElementById("notification-sound-element");
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.id = "notification-sound-element";
    audioEl.src = "/notification.mp3";
    audioEl.style.display = "none";
    audioEl.preload = "auto";
    document.body.appendChild(audioEl);
  }
  notificationAudio = audioEl;
  notificationAudio.volume = 0.12;

  // 2. Create Web Audio API context
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    try {
      audioCtx = new AudioContextClass();
    } catch (e) {
      console.warn("Failed to initialize AudioContext:", e);
    }
  }

  const unlock = () => {
    console.log("User gesture captured: unlocking audio system...");
    
    // Unlock HTML5 Audio
    if (notificationAudio) {
      notificationAudio.play()
        .then(() => {
          notificationAudio.pause();
          notificationAudio.currentTime = 0;
          isUnlocked = true;
          console.log("HTML5 Audio element successfully unlocked.");
        })
        .catch((err) => {
          console.warn("HTML5 Audio unlock attempt failed:", err);
        });
    }

    // Unlock Web Audio Context
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume()
        .then(() => {
          console.log("Web Audio Context successfully resumed/unlocked.");
        })
        .catch((err) => {
          console.warn("Web Audio Context resume failed:", err);
        });
    }

    // Clean up listeners after first user interaction
    cleanup();
  };

  const cleanup = () => {
    window.removeEventListener("click", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };

  // Register in the capturing phase (true) to run before any e.stopPropagation() in elements
  window.addEventListener("click", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
};

const playWebAudioBeep = () => {
  try {
    if (audioCtx) {
      // Warm up / resume the context if suspended
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "sine";
      // Gentle warm G4 note (392 Hz)
      osc.frequency.setValueAtTime(392.00, audioCtx.currentTime);
      
      // Extremely low volume, fast decay for a subtle click/pop sound
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
      console.log("Synthesized notification chime played successfully.");
    } else {
      console.warn("AudioContext is not available for backup chime.");
    }
  } catch (err) {
    console.warn("Failed to play synthesized chime:", err);
  }
};

export const playNotificationSound = () => {
  try {
    if (!notificationAudio) {
      initAndUnlockAudio();
    }

    console.log("playNotificationSound invoked.");

    // Try HTML5 Audio first
    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      const playPromise = notificationAudio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Notification sound played successfully via HTML5 Audio.");
          })
          .catch((err) => {
            console.warn("HTML5 Audio play rejected. Falling back to Web Audio synth chime...", err);
            playWebAudioBeep();
          });
      } else {
        console.log("HTML5 Audio play started synchronously.");
      }
    } else {
      console.warn("No HTML5 Audio instance found. Trying Web Audio synth fallback...");
      playWebAudioBeep();
    }
  } catch (err) {
    console.error("Error in playNotificationSound:", err);
    playWebAudioBeep();
  }
};
