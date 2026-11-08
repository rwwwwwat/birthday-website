import { reducedMotion } from './lifecycle.js';
export function createPhotoViewer(root, scope, { onOpen = () => {} } = {}) {
  const dialog = root.querySelector('.photo-dialog');
  const large = dialog.querySelector('img');
  let source, busy = false;
  function motion(from, to) {
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    return 'translate(' + dx + 'px,' + dy + 'px) scale(' + from.width / to.width + ',' + from.height / to.height + ')';
  }
  async function close() {
    if (!dialog.open || busy) return;
    busy = true;
    if (source?.isConnected && !reducedMotion()) {
      const animation = scope.animate(large, [{ transform: 'none', opacity: 1 }, { transform: motion(source.querySelector('img').getBoundingClientRect(), large.getBoundingClientRect()), opacity: 0.4 }], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      await animation.finished.catch(() => {});
    }
    if (scope.alive) { dialog.close(); source?.classList.remove('is-lifted'); source?.focus({ preventScroll: true }); }
    busy = false;
  }
  scope.on(dialog.querySelector('.dialog-close'), 'click', () => void close());
  scope.on(dialog, 'cancel', (event) => { event.preventDefault(); void close(); });
  scope.on(dialog, 'click', (event) => { if (event.target === dialog) void close(); });
  scope.addCleanup(() => { if (dialog.open) dialog.close(); source?.classList.remove('is-lifted'); });
  return {
    async open(button, photo) {
      if (dialog.open || busy) return;
      onOpen(photo);
      source = button; busy = true;
      const from = button.querySelector('img').getBoundingClientRect();
      large.src = photo.src; large.alt = photo.title;
      dialog.querySelector('h2').textContent = photo.title;
      dialog.querySelector('p').textContent = photo.description;
      dialog.querySelector('.photo-number').textContent = String(photo.id).padStart(2, '0') + ' / 10';
      await large.decode().catch(() => {});
      if (!scope.alive) return;
      dialog.showModal(); source.classList.add('is-lifted');
      if (!reducedMotion()) {
        const animation = scope.animate(large, [{ transform: motion(from, large.getBoundingClientRect()), opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
        await animation.finished.catch(() => {});
      }
      busy = false;
    },
  };
}
