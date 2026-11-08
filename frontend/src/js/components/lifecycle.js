export function createScope() {
  const controller = new AbortController();
  const timers = new Set();
  const animations = new Set();
  const cleanups = [];
  const scope = {
    signal: controller.signal,
    get alive() { return !controller.signal.aborted; },
    on(target, event, callback, options = {}) {
      target.addEventListener(event, callback, { ...options, signal: controller.signal });
    },
    timeout(callback, ms) {
      const id = setTimeout(() => { timers.delete(id); if (scope.alive) callback(); }, ms);
      timers.add(id);
      return id;
    },
    wait(ms) {
      if (!scope.alive) return Promise.resolve(false);
      return new Promise((resolve) => {
        const aborted = () => resolve(false);
        controller.signal.addEventListener('abort', aborted, { once: true });
        scope.timeout(() => {
          controller.signal.removeEventListener('abort', aborted); resolve(true);
        }, ms);
      });
    },
    animate(element, frames, options) {
      const animation = element.animate(frames, options);
      animations.add(animation);
      animation.finished.catch(() => {}).finally(() => animations.delete(animation));
      return animation;
    },
    addCleanup(callback) { cleanups.push(callback); },
    dispose() {
      controller.abort();
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.cancel());
      cleanups.forEach((callback) => callback());
    },
  };
  return scope;
}
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
