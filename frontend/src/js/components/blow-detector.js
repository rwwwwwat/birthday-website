export function createBlowGate({ threshold = 0.08, holdMs = 450 } = {}) {
  let since = null;
  return (rms, broadEnergy, now) => {
    if (rms < threshold || broadEnergy < 0.15) { since = null; return false; }
    since ??= now;
    return now - since >= holdMs;
  };
}
export function createBlowDetector({ onLevel, onBlow, onStatus }) {
  let generation = 0, stream, context, source, frame, expiry;
  function stop() {
    generation++; cancelAnimationFrame(frame); clearTimeout(expiry);
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    source?.disconnect(); source = null;
    if (context) void context.close().catch(() => {});
    context = null; onLevel(0);
  }
  async function start() {
    stop(); const token = generation;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      onStatus('当前浏览器不支持麦克风吹气，请使用下方按钮。'); return false;
    }
    onStatus('等待麦克风授权……');
    try {
      const obtained = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (token !== generation) { obtained.getTracks().forEach((track) => track.stop()); return false; }
      stream = obtained;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      context = new Audio();
      const localContext = context;
      await localContext.resume();
      if (token !== generation) return false;
      source = localContext.createMediaStreamSource(stream);
      const analyser = localContext.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser); // No output, recording or upload.
      const samples = new Float32Array(analyser.fftSize);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      const startAt = performance.now();
      let baseline = 0, count = 0, gate;
      onStatus('先安静一小会儿，正在感受周围的声音……');
      const tick = (now) => {
        if (token !== generation) return;
        analyser.getFloatTimeDomainData(samples); analyser.getByteFrequencyData(frequencies);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        const highStart = Math.floor(1000 / (localContext.sampleRate / analyser.fftSize));
        let total = 0, high = 0;
        frequencies.forEach((value, index) => { total += value; if (index >= highStart) high += value; });
        onLevel(Math.min(1, rms * 6));
        if (now - startAt < 800) { baseline += rms; count++; }
        else {
          if (!gate) { gate = createBlowGate({ threshold: Math.max(0.065, baseline / Math.max(1, count) * 2.5) }); onStatus('对着麦克风轻轻持续吹气，也可以点击按钮。'); }
          if (gate(rms, total ? high / total : 0, now)) { stop(); onBlow(); return; }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      expiry = setTimeout(() => { if (token === generation) { stop(); onStatus('没有检测到持续吹气，可再试一次，或直接点击吹灭。'); } }, 15000);
      return true;
    } catch (error) {
      if (token === generation) { stop(); onStatus(error.name === 'NotAllowedError' ? '麦克风未授权，点击吹蜡烛也一样浪漫。' : '暂时无法使用麦克风，请使用点击吹蜡烛。'); }
      return false;
    }
  }
  return { start, stop };
}
