const tbody = document.getElementById('recordTbody');
const totalSpentEl = document.getElementById('totalSpent');
const totalPointsEl = document.getElementById('totalPoints');
const totalValueEl = document.getElementById('totalValue');
const totalProfitEl = document.getElementById('totalProfit');
const saveBtn = document.getElementById('saveBtn');
const costInput = document.getElementById('costInput');
const exportBtn = document.getElementById('exportBtn');
const importInput = document.getElementById('importInput');
const dateInput = document.getElementById('dateInput');
const storeInput = document.getElementById('storeInput');
const spentInput = document.getElementById('spentInput');
const pointsInput = document.getElementById('pointsInput');
const valueInput = document.getElementById('valueInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailEl = document.getElementById('userEmail');
const filterInput = document.getElementById('filterInput');
const monthFilter = document.getElementById('monthFilter');
const sortSelect = document.getElementById('sortSelect');
const LOCAL_RECORDS_KEY = 'clawRecords';
const LOCAL_COST_KEY = 'clawPointCost';
const statusEl = document.getElementById('appStatus');

const db = firebase.firestore();
const auth = firebase.auth();
let currentUser = null;
let records = [];
let editingId = null;
let pointCost = ClawLogData.DEFAULT_POINT_COST;
let filterText = '';
let filterMonth = '';
let sortField = 'date';
let sessionVersion = 0;
let ready = false;
let busyToken = null;
let signingOut = false;
let importAttempt = null;

// Initialize floating particles
function createFloatingParticles() {
  const particlesContainer = document.getElementById('particles');
  const particles = ['🎯', '🎮', '🏆', '⭐', '✨', '🎊', '🎉', '💎'];
  
  setInterval(() => {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.textContent = particles[Math.floor(Math.random() * particles.length)];
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 2 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    
    particlesContainer.appendChild(particle);
    
    setTimeout(() => {
      particle.remove();
    }, 7000);
  }, 3000);
}

// Show success animation
function showSuccessAnimation(element) {
  element.classList.add('success-animation');
  setTimeout(() => {
    element.classList.remove('success-animation');
  }, 600);
}

// Create celebration effect
function createCelebration() {
  const celebrationEmojis = ['🎉', '🎊', '✨', '🏆', '🎯'];
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const emoji = document.createElement('div');
      emoji.textContent = celebrationEmojis[Math.floor(Math.random() * celebrationEmojis.length)];
      emoji.style.position = 'fixed';
      emoji.style.left = Math.random() * window.innerWidth + 'px';
      emoji.style.top = Math.random() * window.innerHeight + 'px';
      emoji.style.fontSize = '2rem';
      emoji.style.zIndex = '9999';
      emoji.style.pointerEvents = 'none';
      emoji.style.animation = 'sparkle 2s ease-out forwards';
      document.body.appendChild(emoji);
      
      setTimeout(() => emoji.remove(), 2000);
    }, i * 100);
  }
}

// Initialize particles when page loads
document.addEventListener('DOMContentLoaded', createFloatingParticles);

// Mascot interactions
const mascotPhrases = {
  welcome: ['歡迎來玩！', '今天手氣如何？', '準備好夾大獎了嗎？', '我是夾夾，陪你一起玩！'],
  success: ['太棒了！', '恭喜夾到寶物！', '手氣真好！', '繼續加油！', '太厲害了！'],
  profit: ['賺到了耶！', '今天大豐收！', '運氣爆棚！', '太幸運了！'],
  loss: ['沒關係，再接再厲！', '下次一定會更好！', '別灰心！', '繼續努力！'],
  idle: ['記得記錄喔！', '要不要再玩一次？', '我在這裡陪你！', '加油加油！']
};

let lastInteractionTime = Date.now();

function updateMascotSpeech(type = 'idle') {
  const speechBubble = document.getElementById('speechBubble');
  if (!speechBubble) return;
  
  const phrases = mascotPhrases[type] || mascotPhrases.idle;
  const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  speechBubble.textContent = randomPhrase;
  
  // Show speech bubble temporarily
  const mascot = document.getElementById('fixedMascot');
  if (mascot) {
    mascot.querySelector('.speech-bubble').style.opacity = '1';
    mascot.querySelector('.speech-bubble').style.transform = 'translateY(0)';
    
    setTimeout(() => {
      mascot.querySelector('.speech-bubble').style.opacity = '';
      mascot.querySelector('.speech-bubble').style.transform = '';
    }, 3000);
  }
  
  lastInteractionTime = Date.now();
}

// Show welcome message on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => updateMascotSpeech('welcome'), 1000);
  
  // Random idle messages
  setInterval(() => {
    if (Date.now() - lastInteractionTime > 30000) { // 30 seconds of no interaction
      updateMascotSpeech('idle');
    }
  }, 30000);
});

// Click mascot to get random message
document.addEventListener('DOMContentLoaded', () => {
  const mascot = document.getElementById('fixedMascot');
  if (mascot) {
    mascot.addEventListener('click', () => {
      updateMascotSpeech('idle');
    });
  }
});

function showStatus(message, kind = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function isCurrentSession(session) {
  return session.version === sessionVersion &&
    currentUser?.uid === session.uid && auth.currentUser?.uid === session.uid;
}

function requireSession(session) {
  if (!isCurrentSession(session)) throw new Error('Session expired');
}

function updateAccess() {
  const disabled = !currentUser || !ready || Boolean(busyToken);
  [dateInput, storeInput, spentInput, pointsInput, valueInput, costInput,
    saveBtn, exportBtn, importInput, filterInput, monthFilter, sortSelect,
    ...tbody.querySelectorAll('button')].forEach((element) => {
    element.disabled = disabled;
  });
  loginBtn.classList.toggle('hidden', Boolean(auth.currentUser));
  logoutBtn.classList.toggle('hidden', !auth.currentUser);
  loginBtn.disabled = signingOut;
  logoutBtn.disabled = signingOut;
}

function clearForm() {
  [dateInput, storeInput, spentInput, pointsInput, valueInput].forEach((input) => {
    input.value = '';
  });
  editingId = null;
  saveBtn.textContent = '✨ 新增紀錄';
}

function resetSession(user) {
  sessionVersion += 1;
  currentUser = user;
  ready = false;
  busyToken = null;
  importAttempt = null;
  records = [];
  pointCost = ClawLogData.DEFAULT_POINT_COST;
  costInput.value = String(pointCost);
  filterText = '';
  filterMonth = '';
  sortField = 'date';
  filterInput.value = '';
  monthFilter.value = '';
  sortSelect.value = 'date';
  importInput.value = '';
  userEmailEl.textContent = user?.email || '';
  clearForm();
  renderRecords();
  updateAccess();
}

async function runOperation(action, failureMessage) {
  if (!currentUser || !ready || busyToken) return;
  const session = { uid: currentUser.uid, version: sessionVersion };
  if (!isCurrentSession(session)) return;
  const token = {};
  busyToken = token;
  updateAccess();
  try {
    await action(session);
  } catch (error) {
    if (isCurrentSession(session)) {
      showStatus(error instanceof ClawLogData.ValidationError
        ? error.message : failureMessage, 'error');
    }
  } finally {
    if (busyToken === token) {
      busyToken = null;
      updateAccess();
    }
  }
}

function recordCollection(session) {
  requireSession(session);
  return db.collection('users').doc(session.uid).collection('records');
}

function getCurrentDatetime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function loadSettings(session) {
  const doc = await db.collection('users').doc(session.uid).get();
  requireSession(session);
  if (!doc.exists || doc.data().pointCost === undefined) return '';
  try {
    pointCost = ClawLogData.validatePointCost(doc.data().pointCost);
    costInput.value = String(pointCost);
    return '';
  } catch (error) {
    return '雲端點數成本格式不正確，暫用預設 3.5；原設定仍保留。';
  }
}

async function loadRecords(session) {
  const snapshot = await recordCollection(session).get();
  requireSession(session);
  const loaded = [];
  let skipped = 0;
  for (const doc of snapshot.docs) {
    try {
      loaded.push({ ...ClawLogData.validateRecord(doc.data()), id: doc.id });
    } catch (error) {
      skipped += 1;
    }
  }
  records = loaded;
  return skipped ? `已略過 ${skipped} 筆格式不正確的紀錄，雲端原資料仍保留。` : '';
}

async function addRecord(data, session) {
  const record = ClawLogData.validateRecord({
    ...data, createdAt: data.createdAt || getCurrentDatetime(),
  });
  const ref = await recordCollection(session).add(record);
  requireSession(session);
  records.push({ ...record, id: ref.id });
  renderRecords();
}

async function updateRecord(id, data, session) {
  const record = ClawLogData.validateRecord(data);
  await recordCollection(session).doc(id).set(record);
  requireSession(session);
  records = records.map((old) => old.id === id ? { ...record, id } : old);
  renderRecords();
}

async function removeRecord(id, session) {
  await recordCollection(session).doc(id).delete();
  requireSession(session);
  records = records.filter((record) => record.id !== id);
  renderRecords();
}

loginBtn.addEventListener('click', async () => {
  const version = sessionVersion;
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    if (version === sessionVersion) showStatus('登入失敗，請重試。', 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  if (signingOut) return;
  signingOut = true;
  resetSession(null);
  showStatus('登出中，畫面資料已清空。');
  try {
    await auth.signOut();
  } catch (error) {
    if (!currentUser) showStatus('登出失敗，畫面已清空，請再次點擊登出。', 'error');
  } finally {
    signingOut = false;
    updateAccess();
  }
});

resetSession(null);
showStatus('請登入後管理紀錄。');
auth.onAuthStateChanged(async (user) => {
  resetSession(user);
  if (!user) {
    showStatus('請登入後管理紀錄。');
    return;
  }
  const session = { uid: user.uid, version: sessionVersion };
  showStatus('載入紀錄中…');
  try {
    const settingWarning = await loadSettings(session);
    const recordWarning = await loadRecords(session);
    requireSession(session);
    ready = true;
    renderRecords();
    updateAccess();
    const warning = [settingWarning, recordWarning].filter(Boolean).join(' ');
    showStatus(warning || '紀錄已載入。', warning ? 'warning' : 'info');
  } catch (error) {
    if (isCurrentSession(session)) {
      // Keep an incomplete load read-only, rather than overwriting unknown data.
      showStatus('載入失敗，請重新整理或重新登入後再操作。', 'error');
    }
  }
});

function profitElement(profit) {
  const span = document.createElement('span');
  span.className = profit >= 0
    ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
  span.textContent = (profit < 0 ? '-' : '') + Math.abs(profit).toFixed(2);
  return span;
}

function renderRecords() {
  tbody.replaceChildren();
  const profit = (record) => ClawLogData.calculateProfit(record, pointCost);
  const filtered = records.filter((record) =>
    record.store.toLowerCase().includes(filterText) &&
    (!filterMonth || record.date.startsWith(filterMonth))
  ).sort((a, b) => sortField === 'profit'
    ? profit(b) - profit(a) : b[sortField].localeCompare(a[sortField]));
  let totalSpent = 0;
  let totalPoints = 0;
  let totalValue = 0;
  let totalProfit = 0;
  const fragment = document.createDocumentFragment();
  for (const record of filtered) {
    const recordProfit = profit(record);
    totalSpent += record.spent;
    totalPoints += record.points;
    totalValue += record.value;
    totalProfit += recordProfit;
    const tr = document.createElement('tr');
    tr.className = 'table-row hover:bg-white/10 transition-all duration-300';
    for (const text of [record.date, record.store, `$${record.spent}`,
      record.points, `$${record.value}`]) {
      const cell = document.createElement('td');
      cell.className = 'text-white/90 px-4 py-3 record-cell';
      cell.textContent = String(text);
      tr.appendChild(cell);
    }
    const profitCell = document.createElement('td');
    profitCell.className = 'px-4 py-3';
    profitCell.appendChild(profitElement(recordProfit));
    tr.appendChild(profitCell);
    const actions = document.createElement('td');
    actions.className = 'px-4 py-3 text-center';
    for (const [action, text, color] of [
      ['edit', '✏️ 編輯', 'bg-cyan-500/90 hover:bg-cyan-400 mr-2'],
      ['delete', '🗑️ 刪除', 'bg-rose-500/90 hover:bg-rose-400'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${action}-btn ${color} text-white px-3 py-1 rounded-lg transition-all duration-200 hover:scale-105 shadow-md`;
      button.dataset.id = record.id;
      button.textContent = text;
      button.disabled = !ready || Boolean(busyToken);
      actions.appendChild(button);
    }
    tr.appendChild(actions);
    fragment.appendChild(tr);
  }
  tbody.appendChild(fragment);
  totalSpentEl.textContent = '$' + totalSpent.toFixed(2);
  totalPointsEl.textContent = totalPoints.toFixed(2);
  totalValueEl.textContent = '$' + totalValue.toFixed(2);
  totalProfitEl.replaceChildren(profitElement(totalProfit));
}

saveBtn.addEventListener('click', () => runOperation(async (session) => {
  const record = ClawLogData.validateRecord({
    date: dateInput.value, store: storeInput.value,
    spent: spentInput.value, points: pointsInput.value, value: valueInput.value,
  });
  if (editingId) {
    const old = records.find((item) => item.id === editingId);
    if (!old) throw new Error('Missing record');
    await updateRecord(editingId, { ...record, createdAt: old.createdAt }, session);
  } else {
    await addRecord({ ...record, createdAt: getCurrentDatetime() }, session);
    createCelebration();
    const profit = ClawLogData.calculateProfit(record, pointCost);
    updateMascotSpeech(profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'success');
  }
  requireSession(session);
  clearForm();
  showSuccessAnimation(saveBtn);
  showStatus('紀錄已儲存。');
}, '儲存失敗；請先重新整理核對雲端紀錄，再決定是否重試。'));

costInput.addEventListener('change', () => runOperation(async (session) => {
  try {
    const nextCost = ClawLogData.validatePointCost(costInput.value);
    await db.collection('users').doc(session.uid).set(
      { pointCost: nextCost }, { merge: true }
    );
    requireSession(session);
    pointCost = nextCost;
    renderRecords();
    showStatus('點數成本已儲存。');
  } finally {
    if (isCurrentSession(session)) costInput.value = String(pointCost);
  }
}, '點數成本儲存失敗，請重新整理核對雲端設定。'));

filterInput.addEventListener('input', () => {
  if (!ready) return;
  filterText = filterInput.value.trim().toLowerCase();
  renderRecords();
});
monthFilter.addEventListener('change', () => {
  if (!ready) return;
  filterMonth = monthFilter.value;
  renderRecords();
});
sortSelect.addEventListener('change', () => {
  if (!ready) return;
  sortField = ['date', 'createdAt', 'profit'].includes(sortSelect.value)
    ? sortSelect.value : 'date';
  renderRecords();
});

tbody.addEventListener('click', (event) => {
  if (!currentUser || !ready || busyToken || auth.currentUser?.uid !== currentUser.uid) return;
  const button = event.target.closest('button');
  if (!button) return;
  const record = records.find((item) => item.id === button.dataset.id);
  if (!record) return;
  if (button.classList.contains('edit-btn')) {
    dateInput.value = record.date.includes('T') ? record.date : `${record.date}T00:00`;
    storeInput.value = record.store;
    spentInput.value = record.spent;
    pointsInput.value = record.points;
    valueInput.value = record.value;
    editingId = record.id;
    saveBtn.textContent = '💾 更新紀錄';
  } else if (button.classList.contains('delete-btn') && confirm('確定要刪除此紀錄嗎？')) {
    runOperation(async (session) => {
      await removeRecord(record.id, session);
      if (editingId === record.id) clearForm();
      showStatus('紀錄已刪除。');
    }, '刪除失敗，請重新整理核對紀錄。');
  }
});

function downloadFile(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportBtn.addEventListener('click', () => runOperation(async () => {
  downloadFile(ClawLogData.exportRecordsCsv(records, pointCost),
    'text/csv;charset=utf-8', 'clawRecords.csv');
  showStatus('CSV 已產生；包含所有已載入紀錄，盈虧依目前成本計算。');
}, '匯出失敗，請重試。'));

async function importCsv(file, session) {
  if (file.size > ClawLogData.MAX_CSV_BYTES) {
    throw new ClawLogData.ValidationError('CSV 不可超過 1 MiB');
  }
  const buffer = await file.arrayBuffer();
  requireSession(session);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new ClawLogData.ValidationError('CSV 必須使用 UTF-8 編碼');
  }
  const imported = ClawLogData.parseRecordsCsv(text);
  if (importAttempt && importAttempt.text !== text && !importAttempt.complete) {
    throw new ClawLogData.ValidationError('上一份匯入尚未完成，請重新選擇同一檔案續傳，避免重複資料。');
  }
  if (importAttempt?.text === text && importAttempt.complete) {
    showStatus('這份檔案本次登入已匯入，沒有重複寫入。', 'warning');
    return;
  }
  if (!importAttempt || importAttempt.text !== text) {
    const collection = recordCollection(session);
    importAttempt = {
      text, records: imported, refs: imported.map(() => collection.doc()),
      next: 0, complete: false,
    };
  }
  const attempt = importAttempt;
  showStatus(`匯入 ${attempt.records.length} 筆紀錄中，請保持此頁開啟…`);
  try {
    for (; attempt.next < attempt.records.length; attempt.next += 1) {
      requireSession(session);
      const record = attempt.records[attempt.next];
      const ref = attempt.refs[attempt.next];
      // Reuse the same ID after an uncertain write, so a retry cannot add a duplicate.
      await ref.set(record);
      requireSession(session);
      records.push({ ...record, id: ref.id });
      if ((attempt.next + 1) % 25 === 0) {
        showStatus(`匯入中：已完成 ${attempt.next + 1}/${attempt.records.length} 筆，請保持此頁開啟…`);
      }
    }
    attempt.complete = true;
    showStatus(`已匯入 ${attempt.records.length} 筆紀錄。`);
  } catch (error) {
    if (isCurrentSession(session)) {
      showStatus(`匯入中斷：已確認 ${attempt.next}/${attempt.records.length} 筆，最後一筆可能已寫入。請在此頁重新選同一檔案安全續傳；重新整理或重新登入後，須先核對雲端紀錄，勿直接重匯整檔。`, 'error');
    }
  } finally {
    if (isCurrentSession(session)) renderRecords();
  }
}

importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  if (!file) return;
  runOperation(async (session) => {
    try {
      await importCsv(file, session);
    } finally {
      if (isCurrentSession(session)) importInput.value = '';
    }
  }, '讀取或匯入 CSV 失敗，請檢查檔案後重試。');
});

// Old caches have no owner ID. Never display them or attach them to a signed-in user.
const legacyNotice = document.getElementById('legacyCacheNotice');
const legacyDownloadBtn = document.getElementById('legacyDownloadBtn');
const legacyClearBtn = document.getElementById('legacyClearBtn');
let legacyBackupOffered = false;
function readLegacyCache() {
  return {
    clawRecords: localStorage.getItem(LOCAL_RECORDS_KEY),
    clawPointCost: localStorage.getItem(LOCAL_COST_KEY),
  };
}
try {
  const old = readLegacyCache();
  legacyNotice.hidden = old.clawRecords === null && old.clawPointCost === null;
} catch (error) {
  showStatus('無法檢查舊版本機快取；此版本不使用本機快取儲存紀錄。', 'warning');
}
legacyDownloadBtn.addEventListener('click', () => {
  try {
    downloadFile(JSON.stringify(readLegacyCache(), null, 2),
      'application/json;charset=utf-8', 'clawlog-legacy-cache-backup.json');
    legacyBackupOffered = true;
    legacyClearBtn.disabled = false;
  } catch (error) {
    showStatus('舊快取備份下載失敗，尚未清除資料。', 'error');
  }
});
legacyClearBtn.addEventListener('click', () => {
  if (!legacyBackupOffered || !confirm('請先確認備份 JSON 已下載且可讀。確定要清除此瀏覽器的舊快取？清除後無法由本頁復原。')) return;
  try {
    localStorage.removeItem(LOCAL_RECORDS_KEY);
    localStorage.removeItem(LOCAL_COST_KEY);
    const old = readLegacyCache();
    legacyNotice.hidden = old.clawRecords === null && old.clawPointCost === null;
    showStatus(legacyNotice.hidden ? '已清除舊版本機快取。' : '舊快取尚未完全清除。',
      legacyNotice.hidden ? 'info' : 'warning');
  } catch (error) {
    showStatus('無法完整清除舊快取，請保留備份並檢查瀏覽器儲存設定。', 'error');
  }
});
