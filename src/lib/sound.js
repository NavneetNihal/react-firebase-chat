// ─────────────────────────────────────────────────────────────────────────────
// Notification Sound System
// Single AudioContext shared across everything, properly awaited before use
// ─────────────────────────────────────────────────────────────────────────────

let _ctx = null;            // the ONE AudioContext
let _unlocked = false;      // whether user gesture has been received

const getCtx = () => {
  if (_ctx) return _ctx;
  const Cls = window.AudioContext || window.webkitAudioContext;
  if (!Cls) return null;
  _ctx = new Cls();
  return _ctx;
};

// ── Ensure context is running; returns true if ready ─────────────────────────
const ensureRunning = async () => {
  const ctx = getCtx();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn("[Sound] resume failed:", e);
      return false;
    }
  }
  return ctx.state === "running";
};

// ── Register capture-phase gesture listeners to unlock on first interaction ──
export const initAndUnlockAudio = () => {
  if (typeof window === "undefined" || _unlocked) return;

  const unlock = async () => {
    if (_unlocked) return;
    const ready = await ensureRunning();
    if (ready) {
      _unlocked = true;
      console.log("[Sound] AudioContext unlocked via user gesture.");
    }
    window.removeEventListener("click",      unlock, true);
    window.removeEventListener("keydown",    unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };

  window.addEventListener("click",      unlock, true);
  window.addEventListener("keydown",    unlock, true);
  window.addEventListener("touchstart", unlock, true);
};

// ── Play a specific sound effect (ALL audio done through Web Audio API) ───────
export const playSoundEffect = async (soundId) => {
  if (typeof window === "undefined") return;

  // Always try to ensure context is running first
  const ready = await ensureRunning();
  if (!ready) {
    console.warn("[Sound] AudioContext not running, cannot play:", soundId);
    return;
  }

  const ctx = _ctx;
  const now = ctx.currentTime;
  console.log("[Sound] Playing:", soundId, "at ctx time:", now, "state:", ctx.state);

  switch (soundId) {

    case "oof": {
      // Classic game-style 'oof' — quick rising pitch scoop, triangle wave
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.10);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.setValueAtTime(0.22, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }

    case "chime": {
      // Gentle sine chime
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
      break;
    }

    case "trombone": {
      // Sad trombone — 4 descending sawtooth notes
      const notes = [349.23, 329.63, 311.13, 280.00];
      notes.forEach((freq, i) => {
        const t0 = now + i * 0.22;
        const t1 = t0 + (i === 3 ? 0.55 : 0.20);
        const osc    = ctx.createOscillator();
        const gain   = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = "sawtooth";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(900, t0);
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.linearRampToValueAtTime(freq - 12, t1);
        gain.gain.setValueAtTime(0.09, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t1);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t1 + 0.01);
      });
      break;
    }

    case "buzzer": {
      // Dissonant double-saw buzz
      const osc1   = ctx.createOscillator();
      const osc2   = ctx.createOscillator();
      const gain   = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      filter.type = "lowpass";
      osc1.frequency.setValueAtTime(130.81, now);
      osc2.frequency.setValueAtTime(138.59, now);
      filter.frequency.setValueAtTime(500, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
      osc1.connect(filter); osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now); osc2.start(now);
      osc1.stop(now + 0.42); osc2.stop(now + 0.42);
      break;
    }

    case "laser": {
      // Retro descending zap
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.20);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }

    default:
      console.warn("[Sound] Unknown soundId:", soundId);
  }
};

// ── Main entry point called by Chatlist on new message ───────────────────────
export const playNotificationSound = () => {
  const soundId = (typeof window !== "undefined" &&
    localStorage.getItem("notificationSoundSetting")) || "oof";
  console.log("[Sound] playNotificationSound → soundId:", soundId);
  // playSoundEffect is async but we fire-and-forget intentionally
  playSoundEffect(soundId).catch((e) =>
    console.warn("[Sound] playNotificationSound error:", e)
  );
};
