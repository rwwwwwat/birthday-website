export const heartIcon = '<svg viewBox="0 0 40 38" fill="none" aria-hidden="true"><path d="M20 34S2 23 2 12C2 1 16-1 20 9 24-1 38 1 38 12c0 11-18 22-18 22Z" fill="currentColor"/></svg>';
export const crownIcon = '<svg viewBox="0 0 72 44" fill="none" aria-hidden="true"><path d="m8 13 15 10L36 5l13 18 15-10-7 27H15L8 13Z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="9" r="3" fill="currentColor"/><circle cx="36" cy="3" r="3" fill="currentColor"/><circle cx="64" cy="9" r="3" fill="currentColor"/><path d="M18 34h36" stroke="currentColor"/></svg>';
export function ornaments() {
  return '<div class="ornaments" aria-hidden="true">' +
    Array.from({ length: 6 }, (_, i) => '<span class="heart-balloon balloon-' + i + '" style="--i:' + i + '">' + heartIcon + '<i></i></span>').join('') +
    '<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="little-star star-one">✧</span><span class="little-star star-two">✦</span><span class="little-star star-three">✧</span></div>';
}
export function heading(chapter, label, title, intro) {
  return '<header class="scene-heading"><p class="eyebrow"><span>' + chapter + '</span> / ' + label + '</p><h1 id="scene-title">' + title + '</h1><p class="intro">' + intro + '</p></header>';
}
