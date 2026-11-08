export function celebrate(canvas, reduced = false) {
  if (reduced) return () => {};
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  context.scale(dpr, dpr);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const colors = ['#b86e81', '#d4a861', '#f0c6bb', '#d6adc1', '#fff0c9'];
  const start = performance.now();
  const particles = Array.from({ length: 72 }, (_, i) => {
    const burst = i % 3;
    const angle = i / 24 * Math.PI * 2;
    return { x: width * [0.25, 0.75, 0.5][burst], y: height * [0.33, 0.24, 0.45][burst], vx: Math.cos(angle) * (35 + i % 7 * 12), vy: Math.sin(angle) * (35 + i % 7 * 12), delay: burst * 0.4, color: colors[i % colors.length], heart: i % 4 === 0 };
  });
  let frame, stopped = false;
  function draw(now) {
    if (stopped) return;
    context.clearRect(0, 0, width, height);
    const elapsed = (now - start) / 1000;
    particles.forEach((particle) => {
      const time = elapsed - particle.delay;
      if (time < 0 || time > 2.2) return;
      const x = particle.x + particle.vx * time, y = particle.y + particle.vy * time + 30 * time * time;
      context.globalAlpha = Math.max(0, 1 - time / 2.2);
      context.fillStyle = particle.color;
      if (particle.heart) { context.font = '16px Georgia'; context.fillText('♥', x, y); }
      else { context.beginPath(); context.arc(x, y, 2.2, 0, Math.PI * 2); context.fill(); }
    });
    context.globalAlpha = 1;
    if (elapsed < 3.2) frame = requestAnimationFrame(draw);
    else context.clearRect(0, 0, width, height);
  }
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); context.clearRect(0, 0, width, height); };
}
