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

  // 1. Create/find HTML5 Audio element for the main chime
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
  notificationAudio.volume = 0.12; // Gentle low volume default

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

const playWebAudioChime = (ctx, now) => {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(392.00, now); // G4 note
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (err) {
    console.warn("Chime fallback failed:", err);
  }
};

export const playSoundEffect = (soundId) => {
  if (typeof window === "undefined") return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();
    } catch (e) {
      console.warn("Failed to initialize AudioContext:", e);
      return;
    }
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const ctx = audioCtx;
  const now = ctx.currentTime;

  switch (soundId) {
    case "chime": {
      // Try HTML5 Audio element first for the premium .mp3 chime
      if (notificationAudio) {
        notificationAudio.currentTime = 0;
        const playPromise = notificationAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Played MP3 chime.");
            })
            .catch((err) => {
              console.warn("HTML5 play rejected, falling back to Web Audio chime:", err);
              playWebAudioChime(ctx, now);
            });
        }
      } else {
        playWebAudioChime(ctx, now);
      }
      break;
    }
    case "trombone": {
      // Sad Trombone: 4 descending notes (F4, E4, Eb4, D4) with pitch bend and filter
      const notes = [349.23, 329.63, 311.13, 293.66];
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.22;
        const endTime = startTime + (idx === 3 ? 0.55 : 0.2);
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = "sawtooth";
        filter.type = "lowpass";
        
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.linearRampToValueAtTime(freq - 15, endTime);
        filter.frequency.setValueAtTime(800, startTime);
        
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.linearRampToValueAtTime(0.08, endTime - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, endTime);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(endTime);
      });
      break;
    }
    case "buzzer": {
      // Dissonant low double sawtooth buzz
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      filter.type = "lowpass";
      
      osc1.frequency.setValueAtTime(130.81, now); // C3
      osc2.frequency.setValueAtTime(138.59, now); // C#3
      filter.frequency.setValueAtTime(450, now);
      
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
      break;
    }
    case "oof": {
      // Classic quick jump/oof pitch scoop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.14);
      break;
    }
    case "laser": {
      // Rapid descending sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.18);
      
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.18);
      break;
    }
  }
};

export const playNotificationSound = () => {
  try {
    const selectedSound = (typeof window !== "undefined" && localStorage.getItem("notificationSoundSetting")) || "oof";
    console.log("playNotificationSound playing selected sound setting:", selectedSound);
    playSoundEffect(selectedSound);
  } catch (err) {
    console.error("Error in playNotificationSound:", err);
  }
};
