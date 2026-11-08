export function navigation(previous, next, nextLabel = '继续我们的故事 ♡') {
  return '<nav class="scene-actions" aria-label="故事导航">' +
    (previous ? '<button type="button" class="button secondary" data-scene="' + previous + '"><span aria-hidden="true">←</span> 返回上一站</button>' : '') +
    (next ? '<button type="button" class="button next-button" data-scene="' + next + '">' + nextLabel + ' <span aria-hidden="true">→</span></button>' : '') + '</nav>';
}
export function bindNavigation(root, navigate, scope) {
  root.querySelectorAll('[data-scene]').forEach((button) => {
    scope.on(button, 'click', () => { if (!button.disabled) void navigate(button.dataset.scene); });
  });
}
