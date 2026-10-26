/* Login captcha. Draws a distorted 5-character code on a canvas, fully offline (no Google/third-party service).
   Letters that look alike (0/O, 1/I/L) are left out so honest users are not tripped up. The check ignores upper/lower case.
   Note: this app has no server, so the captcha is a gate against casual guessing and simple scripts, not a bank-grade control. */
(function (G) {
  'use strict';
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', LEN = 5, TTL = 3 * 60 * 1000;
  let answer = '', madeAt = 0;

  const rnd = n => { const a = new Uint32Array(1); (G.crypto || G.msCrypto).getRandomValues(a); return a[0] % n; };
  const rf = (lo, hi) => lo + (rnd(10000) / 10000) * (hi - lo);

  function newCode() { answer = ''; for (let i = 0; i < LEN; i++) answer += CHARS[rnd(CHARS.length)]; madeAt = Date.now(); return answer; }

  /* Paint a fresh code onto the canvas. Safe to call again for "refresh". */
  function draw(cv) {
    if (!cv || !cv.getContext) return;
    const code = newCode(), W = cv.width, H = cv.height, x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#E4F3EA'); g.addColorStop(1, '#FCEFCF');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(43,129,86,${rf(.1, .35)})`; x.beginPath(); x.arc(rf(0, W), rf(0, H), rf(.6, 1.8), 0, 7); x.fill(); }
    const cols = ['#1B5538', '#226944', '#2B8156', '#8A5A00', '#0F3A24'];
    const step = (W - 20) / LEN;
    for (let i = 0; i < LEN; i++) {
      x.save();
      x.translate(14 + step * i + step / 2, H / 2 + rf(-4, 4));
      x.rotate(rf(-.42, .42));
      x.font = `bold ${Math.round(rf(26, 33))}px Georgia, "Times New Roman", serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = cols[rnd(cols.length)];
      x.fillText(code[i], 0, 0);
      x.restore();
    }
    for (let i = 0; i < 4; i++) {                       // strike-through wiggles
      x.strokeStyle = `rgba(27,85,56,${rf(.35, .6)})`; x.lineWidth = rf(1, 1.8); x.beginPath();
      x.moveTo(rf(0, 14), rf(6, H - 6));
      x.bezierCurveTo(rf(W * .2, W * .4), rf(0, H), rf(W * .6, W * .8), rf(0, H), rf(W - 14, W), rf(6, H - 6)); x.stroke();
    }
  }

  /* True when the typed text matches the code on screen (and the code is not stale). */
  const check = typed => !!answer && Date.now() - madeAt < TTL && String(typed || '').replace(/\s+/g, '').toUpperCase() === answer;
  const clear = () => { answer = ''; };

  G.Captcha = { draw, check, clear };
})(window);
