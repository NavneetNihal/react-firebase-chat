import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// WaveformCanvas
// Draws a real-time animated frequency bar chart from a Web Audio AnalyserNode
//
// Props:
//   analyserNode — AnalyserNode from AudioContext, provided by useVoiceNote hook
//
// How it works:
//   1. Reads frequency data from analyserNode every animation frame
//   2. Draws coloured bars on a <canvas> element
//   3. Cancels animation when component unmounts or analyserNode goes away
// ─────────────────────────────────────────────────────────────────────────────

const WaveformCanvas = ({ analyserNode }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null); // requestAnimationFrame ID

  useEffect(() => {
    if (!analyserNode) return;

    const canvas      = canvasRef.current;
    const ctx         = canvas.getContext("2d");
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray   = new Uint8Array(bufferLength);
    const BAR_COUNT   = 40;
    const BAR_GAP     = 2;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      // Pull latest frequency data into dataArray
      analyserNode.getByteFrequencyData(dataArray);

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const barWidth = (W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const step     = Math.floor(bufferLength / BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a chunk of frequency bins into one bar height
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j];
        const avg  = sum / step;
        const barH = Math.max(3, (avg / 255) * H);
        const x    = i * (barWidth + BAR_GAP);
        const y    = (H - barH) / 2;

        // Blue gradient bar
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

    // Cancel animation loop when unmounting or analyserNode changes
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  return <canvas ref={canvasRef} className="waveformCanvas" width={220} height={44} />;
};

export default WaveformCanvas;
