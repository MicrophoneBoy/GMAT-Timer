'use strict';
/* Shared helpers for the widget and the history window: API calls, time formats, icons, theme, charts. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MINUS = '−';

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch('/api/' + path, opt);
  return r.json();
}

function fmt(s, sign) {
  const r = Math.round(Math.abs(s)), neg = s < 0 && r > 0; s = r;                // never "-0:00"
  const t = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  return (neg ? MINUS : sign ? '+' : '') + t;
}
const secs = d => (Math.round(d) >= 0 ? '+' : MINUS) + Math.abs(Math.round(d)) + 's';
let TH = { yellowOff: -20, redOff: 30, gapRed: 30 };
/* colour of a question time against its own target: yellow from target - 20 s, red from target + 30 s */
const cat = (s, t) => s >= t + TH.redOff ? 'bad' : s >= t + TH.yellowOff ? 'warn' : 'good';
const tgt = (rec, q) => q.target ?? rec.pace;                       // sessions saved before targets used the flat pace
const qtypeOf = og => og <= 272 ? 'PS' : og <= 409 ? 'DS' : og <= 466 ? 'TPA' : og <= 612 ? 'RC' : 'CR';
const TYPE = { PS: 'Problem Solving', DS: 'Data Sufficiency', TPA: 'Two-Part', CR: 'Critical Reasoning', RC: 'Reading Comp' };
const TSHORT = { PS: 'PS', DS: 'DS', TPA: '2-Part', CR: 'CR', RC: 'RC' };
const SECNAME = { Q: 'Quant', V: 'Verbal', DI: 'Data Insights' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function setsLabel(ls) {
  if (!ls.length) return '';
  if (ls.length === 1) return ls[0];
  const p = ls.map(l => l.split(' ')), same = p.every(x => x[0] === p[0][0]), nums = p.map(x => +x[1]);
  const word = p[0][0] === 'Set' ? 'Sets' : 'Bonus';
  if (same && nums.every((v, i) => !i || v === nums[i - 1] + 1)) return `${word} ${nums[0]}-${nums[nums.length - 1]}`;
  return same ? `${word} ${nums.join(', ')}` : ls.join(', ');
}

const svg = inner => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
const ICON = {
  play: svg('<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="m7 15 4-5 4 3 5-7"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3 2"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  moon: svg('<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>'),
  book: svg('<path d="M2.5 5.5h6a3.5 3.5 0 0 1 3.5 3.5v11a3 3 0 0 0-3-3H2.5z"/><path d="M21.5 5.5h-6A3.5 3.5 0 0 0 12 9v11a3 3 0 0 1 3-3h6.5z"/>'),
  timer: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  star: svg('<path d="M12 3.6l2.55 5.2 5.7.83-4.13 4.02.98 5.68L12 16.65l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83z"/>'),
  x: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  guess: svg('<path d="M9.2 9.2a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.3"/><circle cx="12" cy="18.2" r=".6" fill="currentColor"/>'),
};

function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  $$('[data-theme-btn]').forEach(b => { b.innerHTML = t === 'dark' ? ICON.sun : ICON.moon; b.title = t === 'dark' ? 'Light mode' : 'Dark mode'; });
  if (save) api('settings', { theme: t });
}
function wireTheme() {
  $$('[data-theme-btn]').forEach(b => b.onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
}
document.addEventListener('contextmenu', e => e.preventDefault());

function stats(rec) {
  const qs = rec.questions, n = qs.length, times = qs.map(q => q.sec), targets = qs.map(q => tgt(rec, q));
  const total = times.reduce((a, b) => a + b, 0), target = targets.reduce((a, b) => a + b, 0);
  let w = 0; times.forEach((t, i) => { if (t - targets[i] > times[w] - targets[w]) w = i; });
  return { n, times, targets, total, target, gap: target - total, avg: total / n, worst: w, over: times[w] - targets[w],
           red: times.filter((t, i) => cat(t, targets[i]) === 'bad').length };
}
/* right / wrong / guessed marks; a guess counts as a miss */
const RES = {
  right: { icon: () => ICON.check, title: 'Right', tone: 'good', glyph: '\u2713' },
  wrong: { icon: () => ICON.x, title: 'Wrong', tone: 'bad', glyph: '\u2715' },
  guess: { icon: () => ICON.guess, title: 'Guessed (counts as a miss)', tone: 'warn', glyph: '?' },
};
const NEXT_RES = { undefined: 'right', right: 'wrong', wrong: 'guess', guess: undefined };
function score(rec) {
  const c = { right: 0, wrong: 0, guess: 0 };
  rec.questions.forEach(q => { if (c[q.result] !== undefined) c[q.result]++; });
  return { ...c, n: rec.questions.length, marked: c.right + c.wrong + c.guess };
}
function scoreText(sc) {
  if (!sc.marked) return 'not marked yet';
  const bits = [`${sc.right}/${sc.n} right`];
  if (sc.wrong) bits.push(`${sc.wrong} wrong`);
  if (sc.guess) bits.push(`${sc.guess} guessed`);
  if (sc.n > sc.marked) bits.push(`${sc.n - sc.marked} unmarked`);
  return bits.join(' · ');
}
const isMiss = q => q.result === 'wrong' || q.result === 'guess';

/* dashed step line through each question's target */
function stepPath(xs, ys, half, lo = -Infinity, hi = Infinity) {
  return xs.map((x, k) => `${k ? 'L' : 'M'}${Math.max(lo, x - half)},${ys[k]}H${Math.min(hi, x + half)}`).join('');
}
const ahead = d => Math.round(d) >= 0;                                         // colour by the shown (rounded) value

/* monotone cubic path through points (no overshoot), like d3.curveMonotoneX */
function monotone(p) {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0][0]},${p[0][1]}`;
  if (n === 2) return `M${p[0][0]},${p[0][1]}L${p[1][0]},${p[1][1]}`;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

function animateLine(root) {
  root.querySelectorAll('.draw').forEach(p => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4, 0, .2, 1)'; p.style.strokeDashoffset = 0;
  });
}

let gid = 0;
/* small chart for the widget's "set done" card */
function sparkline(el, rec) {
  const box = el.parentElement, W = box.clientWidth || 260, H = box.clientHeight || 66, qs = rec.questions, n = qs.length, tg = qs.map(q => tgt(rec, q));
  const top = Math.max(...qs.map(q => q.sec), ...tg) * 1.15, pad = 6;
  const x = k => n === 1 ? W / 2 : pad + (W - 2 * pad) * k / (n - 1), y = s => pad + (H - 2 * pad) * (1 - s / top);
  const pts = qs.map((q, k) => [x(k), y(q.sec)]), id = 'sg' + (++gid), line = monotone(pts);
  const half = n > 1 ? (W - 2 * pad) / (n - 1) / 2 : W / 2;
  el.innerHTML = `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--sky)" stop-opacity=".32"/><stop offset="1" stop-color="var(--sky)" stop-opacity="0"/></linearGradient></defs>
    <path d="${stepPath(pts.map(p => p[0]), tg.map(y), half, 0, W)}" fill="none" stroke="var(--sky-deep)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".55"/>
    ${n > 1 ? `<path d="${line}L${pts[n - 1][0]},${H}L${pts[0][0]},${H}Z" fill="url(#${id})"/>` : ''}
    <path class="draw" d="${line}" fill="none" stroke="var(--sky)" stroke-width="2.5" stroke-linecap="round"/>
    ${pts.map((p, k) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="var(--${cat(qs[k].sec, tg[k])})" stroke="var(--card)" stroke-width="1.8" style="animation:pop .4s ${.4 + k * .05}s both; transform-origin:${p[0]}px ${p[1]}px"/>`).join('')}`;
  animateLine(el);
}

/* full line chart for the history window */
function bigChart(box, rec, tip, opt = {}) {
  const W = Math.max(320, box.clientWidth), H = Math.max(220, box.clientHeight);
  const qs = rec.questions, n = qs.length, tg = qs.map(q => tgt(rec, q));
  const L = 50, R = 78, T = rec.sets.length > 1 ? 34 : 18, B = 116, anim = opt.animate !== false;
  const maxS = Math.max(...qs.map(q => q.sec), ...tg.map(t => t + TH.redOff + 20));
  const step = maxS > 480 ? 120 : maxS > 260 ? 60 : 30;
  const top = Math.ceil(maxS * 1.1 / step) * step;
  const x = k => L + (W - L - R) * (k + .5) / n, y = s => T + (H - T - B) * (1 - s / top);
  const pw = W - L - R, colW = pw / n, id = 'g' + (++gid);
  const pts = qs.map((q, k) => [x(k), y(q.sec)]), line = monotone(pts), base = y(0);
  let s = `<defs>
    <linearGradient id="${id}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--sky)" stop-opacity=".30"/><stop offset="1" stop-color="var(--sky)" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}c"><rect x="${L}" y="${T}" width="${pw}" height="${base - T}" rx="12"/></clipPath></defs>`;
  s += `<g clip-path="url(#${id}c)"><rect x="${L}" y="${T}" width="${pw}" height="${base - T}" fill="var(--card-2)"/>`;
  tg.forEach((t, k) => {                                          // each column gets its own yellow / red zone
    const x0 = L + colW * k, yr = y(t + TH.redOff), yy = y(t + TH.yellowOff);
    s += `<rect x="${x0}" y="${T}" width="${colW + .5}" height="${Math.max(0, yr - T)}" fill="var(--bad-soft)" opacity=".75"/>
      <rect x="${x0}" y="${yr}" width="${colW + .5}" height="${yy - yr}" fill="var(--warn-soft)" opacity=".8"/>`;
  });
  s += `</g>`;
  for (let v = 0; v <= top; v += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"${v ? ' stroke-dasharray="2 5"' : ''}/>
      <text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="Bahnschrift">${fmt(v)}</text>`;
  }
  // set separators and names
  let g0 = 0;
  for (let k = 1; k <= n; k++) {
    if (k === n || qs[k].set !== qs[k - 1].set) {
      if (rec.sets.length > 1) s += `<text x="${(x(g0) + x(k - 1)) / 2}" y="${T - 12}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--sky-deep)">${esc(qs[g0].set)}</text>`;
      if (k < n) s += `<line x1="${x(k) - colW / 2}" x2="${x(k) - colW / 2}" y1="${T - 4}" y2="${base}" stroke="var(--line-2)" stroke-dasharray="3 4"/>`;
      g0 = k;
    }
  }
  const flat = tg.every(t => Math.abs(t - tg[0]) < 1), yl = y(tg[n - 1]);
  s += `<path d="${stepPath(pts.map(p => p[0]), tg.map(y), colW / 2)}" fill="none" stroke="var(--sky-deep)" stroke-width="1.6" stroke-dasharray="6 5" opacity=".8"/>
    <g transform="translate(${W - R + 6},${yl - 9})"><rect width="70" height="18" rx="9" fill="var(--card)" stroke="var(--line-2)"/>
    <text x="35" y="13" text-anchor="middle" font-size="11" font-weight="600" fill="var(--sky-deep)">${flat ? 'target ' + fmt(tg[0]) : 'target'}</text></g>`;
  s += `<line class="vline" x1="0" x2="0" y1="${T}" y2="${base}"/>`;
  if (n > 1) s += `<path d="${line}L${pts[n - 1][0]},${base}L${pts[0][0]},${base}Z" fill="url(#${id}a)"/>`;
  s += `<path class="draw" d="${line}" fill="none" stroke="var(--sky)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const showPills = n <= 18, lvTxt = { Easy: 'E', Medium: 'M', Hard: 'H' };
  qs.forEach((q, k) => {
    const [px, py] = pts[k], d = tg[k] - q.sec, c = cat(q.sec, tg[k]), up = ahead(d);
    s += `<circle class="pt" data-k="${k}" cx="${px}" cy="${py}" r="6.5" fill="var(--${c})" stroke="var(--card)" stroke-width="3"${anim ? ` style="animation:pop .45s ${.25 + k * .045}s both; transform-origin:${px}px ${py}px"` : ''}/>`;
    if (showPills) {
      const tx = secs(d), w = 10 + tx.length * 6.6, ty = py - 30 < T - 2 ? py + 14 : py - 28;
      s += `<g${anim ? ` style="animation:fadeIn .4s ${.5 + k * .045}s both"` : ''}><rect x="${px - w / 2}" y="${ty}" width="${w}" height="17" rx="8.5" fill="var(--${up ? 'good' : 'bad'}-soft)"/>
        <text x="${px}" y="${ty + 12.5}" text-anchor="middle" font-size="11" font-weight="700" font-family="Bahnschrift" fill="var(--${up ? 'good' : 'bad'}-ink)">${tx}</text></g>`;
    }
    const lv = lvTxt[q.level] || '';
    s += `<text x="${px}" y="${base + 18}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)" font-family="Bahnschrift">Q${k + 1}</text>
      <text x="${px}" y="${base + 33}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${q.read ? '• ' : ''}OG ${q.og}</text>`;
    if (lv) s += `<g transform="translate(${px - 9},${base + 40})"><rect width="18" height="15" rx="5" fill="var(--lv-${lv}-bg)"/>
      <text x="9" y="11" text-anchor="middle" font-size="10" font-weight="700" fill="var(--lv-${lv}-fg)">${lv}</text></g>`;
    s += `<rect class="hit" data-k="${k}" x="${px - colW / 2}" y="${T}" width="${colW}" height="${base - T + 58}"/>`;
  });
  qs.forEach((q, k) => {                                          // result badges: click to cycle right, wrong, guessed, unmarked
    const px = pts[k][0], r = RES[q.result], cy = base + 74;
    s += `<g class="res" data-k="${k}" transform="translate(${px},${cy})"><title>${r ? r.title : 'Not marked'} (click to change)</title>
      <circle r="10" fill="${r ? `var(--${r.tone})` : 'var(--card)'}" stroke="${r ? 'var(--card)' : 'var(--line-2)'}" stroke-width="${r ? 2 : 1.5}"${r ? '' : ' stroke-dasharray="3 3"'}/>
      <text y="4.5" text-anchor="middle" font-size="12" font-weight="800" fill="${r ? '#fff' : 'var(--muted)'}">${r ? r.glyph : ''}</text></g>`;
    s += `<g class="sv${q.saved ? ' on' : ''}" data-k="${k}" transform="translate(${px - 9},${cy + 15}) scale(.75)"><title>${q.saved ? 'Saved for review (click to unsave)' : 'Save for review'}</title>
      <rect x="-2" y="-2" width="28" height="28" fill="transparent"/>
      <path d="M12 3.6l2.55 5.2 5.7.83-4.13 4.02.98 5.68L12 16.65l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83z" stroke-width="1.8" stroke-linejoin="round"
        fill="${q.saved ? 'var(--sky)' : 'none'}" stroke="${q.saved ? 'var(--sky)' : 'var(--line-2)'}"/></g>`;
  });
  box.innerHTML = `<svg width="${W}" height="${H}">${s}</svg>`;
  if (anim) animateLine(box);
  if (opt.onMark) box.querySelectorAll('.res').forEach(g => g.onclick = () => opt.onMark(+g.dataset.k));
  if (opt.onSave) box.querySelectorAll('.sv').forEach(g => g.onclick = () => opt.onSave(+g.dataset.k));
  if (!tip) return;
  const vline = box.querySelector('.vline');
  box.querySelectorAll('.hit').forEach(h => {
    h.onmouseenter = () => {
      const k = +h.dataset.k, q = qs[k], d = tg[k] - q.sec, c = cat(q.sec, tg[k]), [px, py] = pts[k], ty = q.type || qtypeOf(q.og);
      box.querySelectorAll('.pt').forEach(p => p.classList.toggle('hov', +p.dataset.k === k));
      vline.setAttribute('x1', px); vline.setAttribute('x2', px); vline.classList.add('on');
      tip.className = 'tip on s-' + c;
      tip.innerHTML = `<div class="tt-h"><span class="qn">Q${k + 1}</span>OG ${q.og} · ${TYPE[ty]}${q.level ? ' · ' + q.level : ''}</div>
        <div class="tt-b"><b>${fmt(q.sec)}</b><span class="pill ${ahead(d) ? 'good' : 'bad'}">${secs(d)}</span><span class="muted">target ${fmt(tg[k])}</span></div>
        <div class="tt-f">${esc(q.set)}${q.read ? ' · first question of a passage (target includes reading)' : ''}</div>`;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(px - tw / 2, 0), W - tw) + 'px';
      tip.style.top = (py - th - 16 < 0 ? py + 18 : py - th - 16) + 'px';
    };
    h.onmouseleave = () => { tip.classList.remove('on'); vline.classList.remove('on'); box.querySelectorAll('.pt.hov').forEach(p => p.classList.remove('hov')); };
  });
}
