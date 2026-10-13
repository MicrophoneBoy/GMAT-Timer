'use strict';
/* History window: session list (select, multi-delete) + the line chart of the selected session. */
let H = [], sel = null, checked = new Set(), filter = 'all', ver = -1, focusN = -1, pending = [];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(s) {
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d) ? s : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${s.slice(11)}`;
}
const shown = () => H.filter(r => filter === 'all' || r.section === filter);
const byId = id => H.find(r => r.id === id);

async function load() {
  const d = await api('history');
  H = d.items.slice().reverse(); ver = d.version;
  for (const id of [...checked]) if (!byId(id)) checked.delete(id);
  const nq = H.reduce((a, r) => a + r.questions.length, 0);
  $('#sub').textContent = H.length ? `${H.length} session${H.length > 1 ? 's' : ''} · ${nq} questions timed` : 'No sessions yet';
  const list = shown();
  if (!list.find(r => r.id === sel)) sel = list.length ? list[0].id : null;
  renderList(); renderDetail();
}

function renderList() {
  const list = shown();
  $('#items').innerHTML = list.length ? list.map(r => {
    const t = stats(r);
    return `<div class="item${r.id === sel ? ' on' : ''}" data-id="${r.id}">
      <label class="check"><input type="checkbox"${checked.has(r.id) ? ' checked' : ''}><span></span></label>
      <div style="min-width:0"><div class="it-title"><i style="background:var(--sec-${r.section})"></i>${SECNAME[r.section] === 'Data Insights' ? 'DI' : SECNAME[r.section]} · ${esc(setsLabel(r.sets))}</div>
        <div class="it-sub">${when(r.date)} · ${t.n} Q${r.complete ? '' : ' · partial'}</div></div>
      <div class="it-right"><b>${fmt(t.total)}</b><span class="pill ${ahead(t.gap) ? 'good' : 'bad'}">${fmt(t.gap, true)}</span></div></div>`;
  }).join('') : `<div class="empty-state">${ICON.timer}<b>No sessions here yet</b><span>Finish a set in the timer and it shows up here.</span></div>`;
  $$('#items .item').forEach(it => {
    const id = it.dataset.id, box = it.querySelector('input');
    box.onclick = e => { e.stopPropagation(); box.checked ? checked.add(id) : checked.delete(id); updDel(); };
    it.querySelector('.check').onclick = e => e.stopPropagation();
    it.onclick = () => { sel = id; $$('#items .item').forEach(x => x.classList.toggle('on', x.dataset.id === id)); renderDetail(); };
  });
  updDel();
}

function updDel() {
  const list = shown(), n = list.filter(r => checked.has(r.id)).length;
  $('#delBtn').innerHTML = ICON.trash + (n ? `Delete ${n}` : 'Delete');
  $('#delBtn').disabled = !n;
  $('#all').checked = n > 0 && n === list.length;
  $('#all').indeterminate = n > 0 && n < list.length;
}
$('#all').onchange = () => {
  shown().forEach(r => $('#all').checked ? checked.add(r.id) : checked.delete(r.id));
  renderList();
};

function renderDetail() {
  const r = byId(sel);
  $('#detail').hidden = !r; $('#noSel').hidden = !!r;
  if (!r) { $('#noSel').innerHTML = `${ICON.chart}<b>Nothing to chart yet</b><span>Time a set and its chart appears here.</span>`; return; }
  const t = stats(r), wq = r.questions[t.worst];
  $('#dTitle').innerHTML = `<i style="background:var(--sec-${r.section})"></i>${SECNAME[r.section]} · ${esc(setsLabel(r.sets))}`;
  $('#dDate').textContent = when(r.date);
  $('#dBadge').innerHTML = r.complete ? '' : '<span class="badge">ended early</span>';
  const tile = (cls, big, small) => `<div class="card tile ${cls}"><span class="k">${small[0]}</span><b>${big}</b><small>${small[1]}</small></div>`;
  $('#tiles').innerHTML = [
    tile('', fmt(t.total), ['Total time', `${t.n} questions`]),
    tile(ahead(t.gap) ? 's-good' : 's-bad', fmt(t.gap, true), ['vs target', `target ${fmt(t.target)}`]),
    tile('', fmt(t.avg), ['Average', 'per question']),
    tile(t.over > 0 ? 's-bad' : 's-good', fmt(t.over, true), ['Worst', `Q${t.worst + 1} · OG ${wq.og} · ${TSHORT[wq.type || qtypeOf(wq.og)]}`]),
    tile(t.red ? 's-bad' : 's-good', String(t.red), ['30s+ over', `of ${t.n} questions`]),
  ].join('');
  const read = r.questions.some(q => q.read);
  $('#legend').innerHTML = `<span><i style="background:var(--sky);height:4px"></i>your time</span>
    <span><i style="height:0;border-top:2px dashed var(--sky-deep);border-radius:0"></i>target (by question type)</span>
    <span><i style="background:var(--warn-soft);border:1px solid var(--warn)"></i>20s under to 30s over</span>
    <span><i style="background:var(--bad-soft);border:1px solid var(--bad)"></i>30s+ over</span>
    <span><b style="color:var(--ink)">E M H</b> difficulty</span>
    ${read ? '<span><b style="color:var(--ink)">&bull; OG</b> first question of a passage (target includes reading)</span>' : ''}`;
  requestAnimationFrame(() => bigChart($('#chart'), r, $('#tip')));
}

let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const r = byId(sel); if (r) bigChart($('#chart'), r, $('#tip')); }, 120); });

// filter
$$('#filter button').forEach((b, i) => b.onclick = () => {
  filter = b.dataset.f; $('#filter').style.setProperty('--i', i);
  $$('#filter button').forEach(x => x.classList.toggle('on', x === b));
  const list = shown(); if (!list.find(r => r.id === sel)) sel = list.length ? list[0].id : null;
  renderList(); renderDetail();
});

// delete
function askDelete(ids) {
  pending = ids.filter(byId); if (!pending.length) return;
  $('#mTitle').textContent = `Delete ${pending.length} session${pending.length > 1 ? 's' : ''}?`;
  $('#mList').innerHTML = pending.map(id => { const r = byId(id); return `<li>${SECNAME[r.section]} · ${esc(setsLabel(r.sets))} · ${when(r.date)}</li>`; }).join('');
  $('#mOk').innerHTML = ICON.trash + 'Delete';
  $('#modal').classList.add('on');
}
const closeModal = () => $('#modal').classList.remove('on');
$('#mCancel').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
$('#mOk').onclick = async () => {
  await api('delete', { ids: pending }); pending.forEach(id => checked.delete(id)); closeModal(); await load();
};
$('#delBtn').onclick = () => askDelete(shown().filter(r => checked.has(r.id)).map(r => r.id));
$('#delOne').innerHTML = ICON.trash;
$('#delOne').onclick = () => sel && askDelete([sel]);

document.addEventListener('keydown', e => {
  if ($('#modal').classList.contains('on')) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') $('#mOk').click();
    return;
  }
  const list = shown(), i = list.findIndex(r => r.id === sel);
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
    e.preventDefault();
    sel = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].id;
    renderList(); renderDetail();
    $('#items .item.on')?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Delete') {
    const ids = list.filter(r => checked.has(r.id)).map(r => r.id);
    askDelete(ids.length ? ids : sel ? [sel] : []);
  }
});

// a finished set or the widget's History button asks this window to show a session
async function poll() {
  try {
    const p = await api('poll');
    if (p.theme !== document.documentElement.dataset.theme) setTheme(p.theme);
    if (p.version !== ver) await load();
    if (p.focus.n !== focusN) {
      focusN = p.focus.n;
      if (p.focus.id && byId(p.focus.id)) {
        if (filter !== 'all' && byId(p.focus.id).section !== filter) $('#filter button[data-f="all"]').click();
        sel = p.focus.id; renderList(); renderDetail();
      }
    }
  } catch (e) { /* timer closed */ }
}

(async () => {
  const s = await api('settings'); setTheme(s.theme || 'light'); wireTheme();
  const init = await api('init'); TH = init;
  await load(); await poll();
  setInterval(poll, 1000);
})();
