'use strict';
/* The floating widget. Python owns the clock; this page polls /api/state and draws it.
   Every question has its own target (by type); colours and +/- seconds are measured against it. */
const BASE_W = 300, BASE_H = 440, MAX_SETS = 10;
const C1 = 2 * Math.PI * 78, C2 = 2 * Math.PI * 63;
let INIT = null, S = null, recvAt = 0, sec = 'Q', picked = [], view = '', shown = -1, armed = 0, busy = false;

const stage = $('#stage');
function fit() { stage.style.zoom = Math.min(innerWidth / BASE_W, innerHeight / BASE_H); }
addEventListener('resize', fit); fit();

let toastT = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- setup: pick any sets, in any order ----------
function buildSeg() {
  const keys = Object.keys(INIT.sections);
  $('#seg').innerHTML = '<span class="glider"></span>' + keys.map(k => `<button data-sec="${k}">${k === 'DI' ? 'DI' : INIT.sections[k].name}</button>`).join('');
  $$('#seg button').forEach(b => b.onclick = () => pickSec(b.dataset.sec));
}
function pickSec(k) {
  sec = k; const s = INIT.sections[k];
  $('#seg').style.setProperty('--i', Object.keys(INIT.sections).indexOf(k));
  $$('#seg button').forEach(b => b.classList.toggle('on', b.dataset.sec === k));
  picked = s.sets.length ? [s.next] : [];
  if (!s.sets.length) {
    $('#picker').innerHTML = `<div class="missing">Booklet not found:<br><b>${esc(s.missing || '')}</b></div>`;
    return summary();
  }
  $('#picker').innerHTML = s.sets.map((x, i) => {
    const bonus = x.label.startsWith('Bonus'), num = x.label.split(' ')[1];
    const tag = x.kind === 'RC' ? 'RC' : bonus ? 'bonus' : '';
    return `<button class="pk${x.kind === 'RC' ? ' rc' : ''}${bonus ? ' bonus' : ''}${x.done ? ' done' : ''}" data-i="${i}"
      title="${x.label}${x.done ? ' · done ' + x.done + 'x' : ''}"><span class="nm">${bonus ? 'B' + num : num}</span>${tag ? `<span class="tg">${tag}</span>` : ''}<i class="ord"></i></button>`;
  }).join('');
  $$('#picker .pk').forEach(b => b.onclick = () => toggle(+b.dataset.i));
  summary();
  const first = $(`#picker .pk[data-i="${s.next}"]`);
  if (first) $('#picker').scrollTop = Math.max(0, first.offsetTop - $('#picker').offsetTop - 40);
}
function toggle(i) {
  const at = picked.indexOf(i);
  if (at >= 0) picked.splice(at, 1);
  else if (picked.length >= MAX_SETS) return toast(`Up to ${MAX_SETS} sets at a time`);
  else picked.push(i);
  summary();
}
$('#clearBtn').onclick = () => { picked = []; summary(); };

function typeLine(ch) {
  const t = {}; let passages = 0;
  ch.forEach(x => { for (const [k, v] of Object.entries(x.types)) t[k] = (t[k] || 0) + v; passages += x.passages; });
  return ['PS', 'DS', 'TPA', 'CR', 'RC'].filter(k => t[k]).map(k => `${t[k]} ${TSHORT[k]}${k === 'RC' ? ` (${passages} passage${passages > 1 ? 's' : ''})` : ''}`).join(' · ');
}
function summary() {
  const s = INIT.sections[sec], ch = picked.map(i => s.sets[i]);
  $$('#picker .pk').forEach(b => {
    const at = picked.indexOf(+b.dataset.i);
    b.classList.toggle('on', at >= 0); b.querySelector('.ord').textContent = at >= 0 && picked.length > 1 ? at + 1 : '';
  });
  const n = ch.reduce((a, x) => a + x.n, 0), secs = ch.reduce((a, x) => a + x.secs, 0);
  $('#sumTime').textContent = fmt(secs);
  $('#sumOrder').textContent = ch.length ? setsLabel(ch.map(x => x.label)) : '';
  $('#sumInfo').innerHTML = ch.length ? `${n} questions · ${typeLine(ch)}` : 'Tap a set to start';
  $('#startBtn').disabled = !ch.length;
}
$('#startBtn').innerHTML = ICON.play + 'Start';
$('#startBtn').onclick = async () => {
  if (!picked.length) return;
  S = await api('start', { sec, sets: picked }); recvAt = performance.now(); render();
};
$('#histBtn').innerHTML = ICON.chart;
$('#histBtn').onclick = () => api('open-results', {});

// ---------- running ----------
$('#undoBtn').innerHTML = ICON.undo;
$('#endBtn').innerHTML = ICON.stop;
$('#resumeBtn').innerHTML = ICON.play + 'Resume';
$('#p1').style.strokeDasharray = C1; $('#p2').style.strokeDasharray = C2;

async function act(name) { S = await api(name, {}); recvAt = performance.now(); render(); }
$('#undoBtn').onclick = async () => {
  const had = S && S.stamps ? S.stamps.length : 0;
  await act('undo');
  if (had) toast(`Undid Q${had}. Its time goes back on the clock.`);
};
$('#pauseBtn').onclick = () => act('pause');
$('#resumeBtn').onclick = () => act('pause');
$('#endBtn').onclick = () => {
  if (Date.now() - armed < 3000) { armed = 0; $('#endBtn').classList.remove('armed'); return act('end'); }
  armed = Date.now(); $('#endBtn').classList.add('armed'); toast('Click again to end the set');
  setTimeout(() => { if (Date.now() - armed >= 3000) $('#endBtn').classList.remove('armed'); }, 3050);
};
document.addEventListener('keydown', e => {                 // only reaches here if the global hotkey is unavailable
  if ((e.key === 'q' || e.key === 'Q') && S && S.state === 'run' && !S.paused) act('q');
});

function enterRun() {
  $('#runSec i').style.background = `var(--sec-${S.sec})`;
  $('#runSec span').textContent = S.secName;
  $('#runSets').textContent = setsLabel(S.labels);
  $('#sectors').innerHTML = '<span></span>'.repeat(S.n);
  shown = -1;
  if (!S.hotkey) toast('Q hotkey is busy: click this window, then press Q', 6000);
}

function renderRun() {
  const now = S.paused ? S.elapsed : S.elapsed + (performance.now() - recvAt) / 1000;
  const st = S.stamps, done = st.length, last = done ? st[done - 1] : 0, cur = Math.max(0, now - last);
  const qi = Math.min(done, S.n - 1), target = S.targets[qi];
  const banked = S.targets.slice(0, done).reduce((a, b) => a + b, 0);
  const gap = banked - last - Math.max(0, cur - target), left = S.total - now;
  const status = left < 0 || gap <= -TH.gapRed ? 'bad' : gap < 0 ? 'warn' : 'good';
  $('#ring').className = 'ring-wrap s-' + status;
  $('#p1').style.strokeDashoffset = C1 * (1 - Math.min(now / S.total, 1));
  $('#p2').style.strokeDashoffset = C2 * (1 - done / S.n);
  $('#leftLbl').textContent = left >= 0 ? 'time left' : 'over time';
  $('#bigTime').textContent = left >= 0 ? fmt(left) : '+' + fmt(-left);
  $('#gapPill').textContent = fmt(gap, true) + ' vs target';
  $('#qcard').className = 'card qcard s-' + cat(cur, target);
  $('#qNum').innerHTML = `Q <b>${qi + 1}</b> / ${S.n}`;
  const ty = S.types[qi];
  $('#qType').textContent = `${S.reads[qi] ? 'RC + read' : TSHORT[ty]} · ${fmt(target)}`;
  $('#qType').title = `${TYPE[ty]}${S.reads[qi] ? ', first question of the passage (target includes reading)' : ''}: target ${fmt(target)}`;
  $('#qTime').textContent = fmt(cur);
  const max = target + 60;                                          // bar ends a minute past the target
  $('#qFill').style.width = Math.min(cur / max, 1) * 100 + '%';
  $('#mkY').style.left = (target + TH.yellowOff) / max * 100 + '%';
  $('#mkR').style.left = (target + TH.redOff) / max * 100 + '%';
  $('#pauseBtn').innerHTML = S.paused ? ICON.play : ICON.pause;
  $('#pauseBtn').title = S.paused ? 'Resume' : 'Pause';
  $('#pausedOv').classList.toggle('on', !!S.paused);
  if (S.paused) $('#pausedInfo').textContent = `${left >= 0 ? fmt(left) + ' left' : fmt(-left) + ' over'} · on Q${qi + 1} of ${S.n}`;
  if (done !== shown) drawSplits(done > shown && shown >= 0);
}

function drawSplits(isNew) {
  const st = S.stamps, done = st.length, times = st.map((t, i) => t - (i ? st[i - 1] : 0));
  $$('#sectors span').forEach((sp, i) => sp.className = i < done ? cat(times[i], S.targets[i]) : i === done ? 'cur' : '');
  const rows = [];
  for (let k = done - 1; k >= Math.max(0, done - 3); k--) {
    const d = S.targets[k] - times[k];
    rows.push(`<li class="s-${cat(times[k], S.targets[k])}${isNew && k === done - 1 ? ' new' : ''}"><span class="qn">Q${k + 1}</span><span class="og">OG ${S.ogs[k]} · ${TSHORT[S.types[k]]}</span>
      <span class="tm">${fmt(times[k])}</span><span class="pill ${ahead(d) ? 'good' : 'bad'}">${secs(d)}</span></li>`);
  }
  $('#splits').innerHTML = rows.join('') || '<li class="empty">Your splits show up here</li>';
  shown = done;
}

// ---------- done ----------
let doneRec = null;                                                // the finished set; marks are edited here, not on polls
function enterDone() {
  doneRec = S.rec; const rec = doneRec, t = stats(rec);
  $('#doneTitle').innerHTML = ICON.flag + (rec.complete ? 'Set done' : 'Ended early');
  $('#doneSub').textContent = `${rec.section === 'DI' ? 'DI' : S.secName} · ${setsLabel(rec.sets)} · ${t.n} Q`;
  const g = $('#doneGap'); g.className = 'pill ' + (ahead(t.gap) ? 'good' : 'bad'); g.textContent = fmt(t.gap, true) + ' vs target';
  $('#doneTotal').textContent = fmt(t.total);
  $('#doneStats').innerHTML = `avg <b>${fmt(t.avg)}</b> · worst <b class="${t.over > 0 ? 'bad' : 'good'}">${fmt(t.over, true)}</b> (Q${t.worst + 1}) · <b>${t.red}</b> 30s+ over`;
  requestAnimationFrame(() => sparkline($('#spark'), rec));
  drawMarks();
}
function drawMarks() {
  const rec = doneRec, t = stats(rec);
  $('#mlist').innerHTML = rec.questions.map((q, k) => {
    const d = t.targets[k] - q.sec;
    return `<li class="s-${cat(q.sec, t.targets[k])}"><span class="qn">Q${k + 1}</span><span class="og">OG ${q.og}</span>
      <span class="tm">${fmt(q.sec)}</span><span class="dl ${ahead(d) ? 'good' : 'bad'}">${secs(d)}</span>
      <span class="rb">${Object.entries(RES).map(([r, v]) => `<button class="r-${r}${q.result === r ? ' on' : ''}" data-k="${k}" data-r="${r}" title="${v.title}">${v.icon()}</button>`).join('')}</span></li>`;
  }).join('');
  $$('#mlist button').forEach(b => b.onclick = () => {
    const k = +b.dataset.k, q = rec.questions[k], r = q.result === b.dataset.r ? null : b.dataset.r;
    if (r) q.result = r; else delete q.result;
    api('mark', { id: rec.id, k, result: r }).then(d => { if (!d.ok) toast('Mark not saved'); }, () => toast('Mark not saved'));
    drawMarks();
  });
  const sc = score(rec);
  $('#score').textContent = sc.marked ? [`${sc.right}/${sc.n} right`, sc.wrong && `${sc.wrong} wrong`, sc.guess && `${sc.guess} guess`].filter(Boolean).join(' \u00b7 ') : 'tap \u2713 \u2715 ? for each';
}
$('#chartBtn').innerHTML = ICON.chart + 'Open chart';
$('#chartBtn').onclick = () => S && S.rec && api('open-results', { id: S.rec.id });
$('#newBtn').onclick = () => act('new');

// ---------- loop ----------
async function refreshInit() { INIT = await api('init'); TH = INIT; if (!$('#seg button')) buildSeg(); pickSec(sec); }

function render() {
  if (!S || !INIT) return;
  if (S.theme && S.theme !== document.documentElement.dataset.theme) setTheme(S.theme);
  const v = S.state === 'run' ? 'run' : S.state === 'done' ? 'done' : 'setup';
  if (v !== view) {
    const from = view; view = v;
    $$('.view').forEach(x => x.classList.toggle('on', x.id === v));
    if (v === 'run') enterRun();
    if (v === 'done') enterDone();
    if (v === 'setup' && from) refreshInit();
  }
  if (v === 'run') renderRun();
}

async function poll() {
  if (busy) return; busy = true;
  try { S = await api('state'); recvAt = performance.now(); } catch (e) { /* server closing */ } finally { busy = false; }
}

(async () => {
  INIT = await api('init'); TH = INIT;
  setTheme(INIT.settings.theme || 'light'); wireTheme();
  sec = INIT.sections[INIT.settings.sec] ? INIT.settings.sec : 'Q';
  buildSeg(); pickSec(sec);
  await poll(); render();
  setInterval(poll, 200); setInterval(render, 100);
})();
