// No wish bodies, background timers, sounds or automatic read mutations.
export function createWishPoller({ fetchStats, onStats, onNew, onError, visible = () => !document.hidden,
  schedule = setTimeout, cancel = clearTimeout, interval = 12000, remember = () => {} }) {
  let active = false, timer, generation = 0, high = 0, initialized = false;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  async function tick(version) {
    if (!active || !visible() || version !== generation) return;
    try {
      const stats = await fetchStats();
      if (!active || version !== generation || !visible()) return;
      onStats(stats);
      if (initialized && stats.latestWishId > high) onNew(stats);
      high = Math.max(high, stats.latestWishId); initialized = true; remember(high);
    } catch (error) { if (active && version === generation) onError(error); }
    finally { if (active && visible() && version === generation) timer = schedule(() => tick(version), interval); }
  }
  return {
    start(previousHigh = 0) { clear(); active = true; high = previousHigh; initialized = previousHigh > 0; const version = ++generation; void tick(version); },
    stop() { active = false; ++generation; clear(); },
    visibilityChanged() { clear(); const version = ++generation; if (active && visible()) void tick(version); },
  };
}
