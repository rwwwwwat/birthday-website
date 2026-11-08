export function cakeArt() {
  return `<svg class="birthday-cake" viewBox="0 0 500 470" role="img" aria-label="插着20岁数字蜡烛的草莓奶油生日蛋糕">
  <defs>
    <linearGradient id="cake-body" x1="0" x2="1"><stop stop-color="#c9829b"/><stop offset=".35" stop-color="#f3c7d3"/><stop offset=".65" stop-color="#f8dbe1"/><stop offset="1" stop-color="#c98a9f"/></linearGradient>
    <linearGradient id="cake-upper" x1="0" x2="1"><stop stop-color="#e7bdba"/><stop offset=".5" stop-color="#fff2db"/><stop offset="1" stop-color="#d8aaa8"/></linearGradient>
    <linearGradient id="candle-wax" x1="0" x2="1" y2="1"><stop stop-color="#fff4d2"/><stop offset=".5" stop-color="#f5c3b5"/><stop offset="1" stop-color="#d49487"/></linearGradient>
    <radialGradient id="cake-top"><stop stop-color="#fff9e9"/><stop offset="1" stop-color="#efd0c7"/></radialGradient>
    <linearGradient id="berry" x1="0" x2="1" y2="1"><stop stop-color="#e69690"/><stop offset="1" stop-color="#b55769"/></linearGradient>
    <filter id="cake-shadow" x="-.3" y="-.3" width="1.6" height="1.8"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#9f6c79" flood-opacity=".16"/></filter>
    <g id="strawberry"><path d="M0 0C-19-15-31 0-25 15L-5 40Q0 46 5 40L25 15C31 0 19-15 0 0" fill="url(#berry)"/><path d="m-20-3 14-2 6-14 7 14 14 2-13 6H-8Z" fill="#859679"/><g fill="#f9d9ac"><ellipse cx="-12" cy="12" rx="1.4" ry="2"/><ellipse cx="8" cy="12" rx="1.4" ry="2"/><ellipse cx="-3" cy="24" rx="1.4" ry="2"/><ellipse cx="2" cy="4" rx="1.4" ry="2"/></g></g>
  </defs>
  <ellipse cx="250" cy="423" rx="190" ry="22" fill="#a77d8320"/>
  <g filter="url(#cake-shadow)">
    <path d="M63 389v10c0 28 374 28 374 0v-10" fill="#d7b889"/><ellipse cx="250" cy="388" rx="187" ry="37" fill="#f5e3bf"/><ellipse cx="250" cy="384" rx="173" ry="30" fill="#fff4dc"/>
    <path d="M95 277v93c0 56 310 56 310 0v-93" fill="url(#cake-body)"/>
    <ellipse cx="250" cy="277" rx="155" ry="46" fill="url(#cake-top)"/>
    <path d="M95 277c15 22 25 15 30 23s2 29 15 29 9-26 20-26 10 13 24 13 8-16 25-10 8 36 24 36 11-30 25-29 12 12 27 9 11-20 22-14 7 26 22 24 10-25 22-27 17 2 25-13 14-9 29-15v-1c-25 47-285 48-310 1" fill="#fff2df"/>
    <path d="M145 218v63c0 38 210 38 210 0v-63" fill="url(#cake-upper)"/><ellipse cx="250" cy="218" rx="105" ry="35" fill="#fff1df"/>
    <path d="M145 218c8 17 20 11 24 22s0 18 11 18 9-16 19-13 12 15 24 12 7-15 19-12 9 23 21 21 7-23 21-20 6 11 21 10 9-15 18-17 18-1 32-21c-19 34-191 35-210 0" fill="#fff9e9"/>
    <g fill="#fff6dd" stroke="#edcfbf" stroke-width="1"><circle cx="110" cy="362" r="6"/><circle cx="130" cy="380" r="6"/><circle cx="154" cy="390" r="6"/><circle cx="180" cy="397" r="6"/><circle cx="208" cy="402" r="6"/><circle cx="237" cy="404" r="6"/><circle cx="266" cy="404" r="6"/><circle cx="296" cy="400" r="6"/><circle cx="324" cy="394" r="6"/><circle cx="350" cy="385" r="6"/><circle cx="375" cy="373" r="6"/><circle cx="391" cy="357" r="6"/></g>
    <path d="M171 346q-17-45-52-25c-14 20 19 38 52 25 33-13 48-36 31-44-22-7-32 25-31 44Z" fill="#b87591" stroke="#9c5d79" stroke-width="2"/><path d="m171 345-28 34 23-6 9 20 6-46 31 33-2-22 19 1-48-18" fill="#c88da5"/><ellipse cx="174" cy="342" rx="10" ry="12" fill="#d5a4b5"/>
    <use href="#strawberry" transform="translate(147 273) scale(.63) rotate(-18)"/><use href="#strawberry" transform="translate(356 265) scale(.7) rotate(16)"/>
    <use href="#strawberry" transform="translate(184 207) scale(.48) rotate(-20)"/><use href="#strawberry" transform="translate(315 207) scale(.48) rotate(20)"/>
    <g class="number-candles" stroke-linejoin="round"><path d="M218 182v33m61-33v33" stroke="#cdaa89" stroke-width="4"/>
      <text x="250" y="191" text-anchor="middle" font-family="Georgia,serif" font-size="86" font-weight="bold" fill="url(#candle-wax)" stroke="#b77a74" stroke-width="1.4">20</text>
      <path d="M221 118v-10m57 10v-10" stroke="#805a53" stroke-width="2"/>
      <g class="flame" style="transform-origin:221px 108px"><path d="M221 108c-24-9-13-29 0-42 4 17 23 32 0 42" fill="#edaf58"/><path d="M221 107c-11-4-5-15 0-22 4 10 11 16 0 22" fill="#fff4c1"/></g>
      <g class="flame" style="transform-origin:278px 108px"><path d="M278 108c-24-9-13-29 0-42 4 17 23 32 0 42" fill="#edaf58"/><path d="M278 107c-11-4-5-15 0-22 4 10 11 16 0 22" fill="#fff4c1"/></g>
    </g>
    <g class="candle-smoke" fill="none" stroke="#b2a6ad" stroke-width="3" stroke-linecap="round"><path d="M221 101c-18-15 12-21-2-37s8-20 0-30"/><path d="M278 101c14-13-12-22 2-35s-6-20 0-30"/></g>
  </g></svg>`;
}
