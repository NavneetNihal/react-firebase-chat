let notificationAudio = null;
let isUnlocked = false;

export const initAndUnlockAudio = () => {
  if (typeof window === "undefined" || notificationAudio) return;

  // Locate or create a hidden audio element in the DOM
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
  notificationAudio.volume = 0.6;

  const unlock = () => {
    if (!notificationAudio || isUnlocked) return;

    notificationAudio.play()
      .then(() => {
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
        isUnlocked = true;
        console.log("Notification audio successfully unlocked via user gesture.");
        cleanup();
      })
      .catch((err) => {
        console.warn("Audio gesture unlock failed (will retry on next interaction):", err);
      });
  };

  const cleanup = () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
    document.removeEventListener("touchstart", unlock);
  };

  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
  document.addEventListener("touchstart", unlock);
};

export const playNotificationSound = () => {
  try {
    if (!notificationAudio) {
      initAndUnlockAudio();
    }

    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      const playPromise = notificationAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Resilient notification play failed (autoplay block?):", err);
          
          // Secondary fallback: Web Audio API synth beep so the user gets *some* sound
          try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
              const ctx = new AudioContextClass();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note - clean chime sound
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.2);
              console.log("Synthesized backup beep played successfully.");
            }
          } catch (synthErr) {
            console.warn("Backup synth beep failed too:", synthErr);
          }
        });
      }
    } else {
      console.warn("Notification audio element not initialized yet.");
    }
  } catch (err) {
    console.error("Error in playNotificationSound:", err);
  }
};
