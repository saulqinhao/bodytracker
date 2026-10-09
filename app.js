const $ = (selector) => document.querySelector(selector);
const KEY = 'bodyjournal-v1';
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = localDate();
let state = { records: [], goals: {} }, page = 1, range = 30, storageReady = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    if (!Array.isArray(saved.records) || !saved.records.every(validRecord)) throw new Error('Invalid data');
    state = { records: saved.records, goals: saved.goals || {} };
  }
} catch { storageReady = false; }
function validRecord(r) { return r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.weight) && r.weight >= 1 && r.weight <= 500 && Number.isFinite(r.waist) && r.waist >= 1 && r.waist <= 300 && typeof r.note === 'string'; }
function persist(next) {
  if (!storageReady) { toast('无法读取本地数据，请检查浏览器存储设置；为保护原有数据，暂未保存。'); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(next)); state = next; return true; }
  catch { toast('保存失败，请检查浏览器存储空间与权限。'); return false; }
}
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000); }
function confirmAction(title, message) {
  return new Promise(resolve => {
    const dialog = $('#confirm-dialog'); $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
    dialog.returnValue = ''; dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }); dialog.showModal();
  });
}
function sorted() { return [...state.records].sort((a, b) => a.date.localeCompare(b.date)); }
function showRecord(record) {
  const form = $('#record-form'); form.reset(); form.elements.originalDate.value = record?.date || ''; form.elements.date.value = record?.date || today;
  form.elements.date.max = today;
  if (record) { form.elements.weight.value = record.weight; form.elements.waist.value = record.waist; form.elements.note.value = record.note; }
  $('#dialog-title').textContent = record ? '编辑记录' : '添加记录'; $('#record-dialog').showModal();
}
async function saveRecord(event) {
  event.preventDefault(); const form = event.currentTarget;
  const record = { date: form.elements.date.value, weight: Number(form.elements.weight.value), waist: Number(form.elements.waist.value), note: form.elements.note.value.trim() };
  if (!validRecord(record) || record.date > today || localDate(new Date(`${record.date}T12:00:00`)) !== record.date) { toast('请填写有效的日期、体重和腹围。'); return; }
  const original = form.elements.originalDate?.value;
  if (state.records.some(r => r.date === record.date && r.date !== original)) {
    if (!await confirmAction('更新已有记录', `${record.date} 已有记录，是否用这次填写的数据替换？`)) return;
  }
  const next = { ...state, records: [...state.records.filter(r => r.date !== record.date && r.date !== original), record] };
  if (!persist(next)) return;
  if (form.id === 'record-form') $('#record-dialog').close();
  else { form.reset(); form.elements.date.value = today; }
  page = 1; render(); toast('记录已保存，继续按自己的节奏前进。');
}
function changeText(current, first, unit) {
  if (!current || !first) return '从第一条记录开始了解自己';
  const delta = current - first;
  return `<span class="change">${delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} ${Math.abs(delta).toFixed(1)} ${unit}</span> 相比首次记录`;
}
function render() {
  const rows = sorted(), latest = rows.at(-1), first = rows[0];
  $('#latest-weight').textContent = latest ? latest.weight.toFixed(1) : '—'; $('#latest-waist').textContent = latest ? latest.waist.toFixed(1) : '—';
  $('#weight-change').innerHTML = changeText(latest?.weight, first?.weight, 'kg'); $('#waist-change').innerHTML = changeText(latest?.waist, first?.waist, 'cm');
  $('#record-count').textContent = rows.length; $('#history-count').textContent = rows.length;
  $('#record-span').textContent = first ? `从 ${first.date.replaceAll('-', '.')} 开始记录` : '今天，是一个很好的开始';
  $('#day-dots').replaceChildren(...Array.from({ length: 7 }, (_, i) => { const dot = document.createElement('i'); const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - (6 - i)); if (rows.some(r => r.date === localDate(date))) dot.className = 'filled'; return dot; }));
  const goals = state.goals, parts = [];
  if (goals.weight) parts.push(`目标体重 ${goals.weight.toFixed(1)} kg${latest ? ` · 当前 ${latest.weight.toFixed(1)} kg` : ''}`);
  if (goals.waist) parts.push(`目标腹围 ${goals.waist.toFixed(1)} cm${latest ? ` · 当前 ${latest.waist.toFixed(1)} cm` : ''}`);
  $('#goal-description').textContent = parts.length ? parts.join('　/　') : '设定你的体重与腹围目标，按自己的节奏前进。';
  $('#edit-goals').innerHTML = `${parts.length ? '调整目标' : '设置目标'} <span>↗</span>`;
  renderChart(rows); renderTable(rows);
}
function renderChart(all) {
  const cutoff = new Date(`${today}T00:00:00`); cutoff.setDate(cutoff.getDate() - (range - 1));
  const rows = range ? all.filter(r => r.date >= localDate(cutoff)) : all;
  if (!rows.length) { $('#chart').innerHTML = '<div class="chart-empty"><strong>从第一笔记录，看见改变</strong><span>添加体重与腹围后，趋势会在这里慢慢展开</span></div>'; return; }
  const W = 650, H = 224, left = 44, right = 606, top = 16, bottom = 188;
  const scale = key => { const values = rows.map(r => r[key]); const low = Math.min(...values), high = Math.max(...values), pad = Math.max((high - low) * .3, 1); return { min: low - pad, max: high + pad }; };
  const scales = { weight: scale('weight'), waist: scale('waist') };
  const time = date => new Date(`${date}T12:00:00`).getTime();
  const t0 = time(rows[0].date), t1 = time(rows.at(-1).date);
  const x = r => rows.length === 1 ? (left + right) / 2 : left + (time(r.date) - t0) / (t1 - t0) * (right - left);
  const y = (r, key) => bottom - (r[key] - scales[key].min) / (scales[key].max - scales[key].min) * (bottom - top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重与腹围变化，左轴为公斤，右轴为厘米"><title>体重与腹围趋势图</title>`;
  for (let i = 0; i <= 4; i++) {
    const yy = top + (bottom - top) * i / 4;
    svg += `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#eaf0e9" stroke-dasharray="3 5"/><text x="${left - 10}" y="${yy + 3}" text-anchor="end" fill="#7b9a85" font-size="9">${(scales.weight.max - (scales.weight.max - scales.weight.min) * i / 4).toFixed(1)}</text><text x="${right + 10}" y="${yy + 3}" fill="#b2a1c5" font-size="9">${(scales.waist.max - (scales.waist.max - scales.waist.min) * i / 4).toFixed(1)}</text>`;
  }
  for (const [key, color] of [['weight', '#639a7b'], ['waist', '#b3a0ce']]) {
    const points = rows.map(r => `${x(r)},${y(r, key)}`).join(' ');
    svg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const r of rows) svg += `<circle cx="${x(r)}" cy="${y(r, key)}" r="3.5" fill="white" stroke="${color}" stroke-width="2"><title>${r.date} ${key === 'weight' ? '体重' : '腹围'} ${r[key].toFixed(1)} ${key === 'weight' ? 'kg' : 'cm'}</title></circle>`;
  }
  const labelCount = Math.min(rows.length, 6);
  const indices = [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round(i * (rows.length - 1) / Math.max(1, labelCount - 1))))];
  indices.forEach(i => { svg += `<text x="${x(rows[i])}" y="211" text-anchor="middle" fill="#a2ada2" font-size="9">${rows[i].date.slice(5).replace('-', '/')}</text>`; });
  $('#chart').innerHTML = svg + '</svg>';
}
function renderTable(ascending) {
  const rows = [...ascending].reverse(), pages = Math.max(1, Math.ceil(rows.length / 5)); page = Math.min(page, pages);
  const tbody = $('#records'); tbody.replaceChildren();
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">还没有记录。记录今天，开启你的变化旅程。</td></tr>'; }
  rows.slice((page - 1) * 5, page * 5).forEach(r => {
    const tr = document.createElement('tr');
    [r.date.replaceAll('-', '.'), r.weight.toFixed(1), r.waist.toFixed(1), r.note || '—'].forEach((value, index) => { const td = document.createElement('td'); td.textContent = value; if (index === 3) td.className = 'note'; tr.append(td); });
    const td = document.createElement('td'); td.className = 'right';
    const edit = document.createElement('button'); edit.className = 'row-button'; edit.textContent = '编辑'; edit.setAttribute('aria-label', `编辑 ${r.date} 的记录`); edit.onclick = () => showRecord(r);
    const remove = document.createElement('button'); remove.className = 'row-button danger'; remove.textContent = '删除'; remove.setAttribute('aria-label', `删除 ${r.date} 的记录`);
    remove.onclick = async () => { if (await confirmAction('删除这条记录？', `删除 ${r.date} 的记录后无法恢复。`)) { if (persist({ ...state, records: state.records.filter(item => item.date !== r.date) })) { render(); toast('记录已删除'); } } };
    td.append(edit, remove); tr.append(td); tbody.append(tr);
  });
  $('#table-summary').textContent = rows.length ? `共 ${rows.length} 条记录 · 每页 5 条` : '还没有记录'; $('#page-label').textContent = `${page} / ${pages}`;
  $('#prev-page').disabled = page === 1; $('#next-page').disabled = page === pages; $('#export').disabled = !rows.length;
}
$('#quick-date').value = today; $('#quick-date').max = today;
$('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
$('#quick-form').addEventListener('submit', saveRecord); $('#record-form').addEventListener('submit', saveRecord);
$('#add-top').onclick = () => showRecord();
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => document.getElementById(button.dataset.close).close());
function openGoals() { $('#goal-weight').value = state.goals.weight || ''; $('#goal-waist').value = state.goals.waist || ''; $('#goal-dialog').showModal(); }
$('#edit-goals').onclick = openGoals; $('#goal-nav').onclick = openGoals;
$('#goal-form').onsubmit = event => { event.preventDefault(); const goals = {}; for (const key of ['weight', 'waist']) { const value = event.currentTarget.elements[key].value; if (value) goals[key] = Number(value); } if (persist({ ...state, goals })) { $('#goal-dialog').close(); render(); toast('目标已更新'); } };
$('#range-picker').onclick = event => { const button = event.target.closest('[data-range]'); if (!button) return; range = Number(button.dataset.range); $('#range-picker .selected')?.classList.remove('selected'); button.classList.add('selected'); renderChart(sorted()); };
$('#prev-page').onclick = () => { page--; renderTable(sorted()); }; $('#next-page').onclick = () => { page++; renderTable(sorted()); };
$('#export').onclick = () => {
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  const safeNote = note => /^[=+@\-\t\r\n]/.test(note) ? `'${note}` : note;
  const csv = '\uFEFF' + [['日期', '体重(kg)', '腹围(cm)', '备注'], ...sorted().map(r => [r.date, r.weight, r.waist, safeNote(r.note)])].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `轻记-身体记录-${today}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('数据已导出');
};
document.querySelectorAll('nav a').forEach(link => link.onclick = () => { document.querySelector('nav .active')?.classList.remove('active'); link.classList.add('active'); });
render();
if (!storageReady) toast('本地数据读取失败，原数据未被覆盖。请检查浏览器存储设置。');
