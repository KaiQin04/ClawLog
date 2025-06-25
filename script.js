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

const db = firebase.firestore();
let currentUser = null;
let records = [];
let editingId = null;
let pointCost = 3.5;
let filterText = '';
let filterMonth = '';
let sortField = 'createdAt';

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

loginBtn.addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
});

logoutBtn.addEventListener('click', () => {
  firebase.auth().signOut();
});

function calculateProfit(spent, points, value) {
  return points * pointCost - spent + value;
}

function formatProfit(profit) {
  const formatted = Math.abs(profit).toFixed(2);
  return profit >= 0
    ? `<span class="text-green-600">${formatted}</span>`
    : `<span class="text-red-600">-${formatted}</span>`;
}

function getCurrentDatetime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

function saveLocalRecords() {
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
}

function loadLocalRecords() {
  const data = localStorage.getItem(LOCAL_RECORDS_KEY);
  try {
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalPointCost() {
  localStorage.setItem(LOCAL_COST_KEY, pointCost.toString());
}

function loadLocalPointCost() {
  const val = localStorage.getItem(LOCAL_COST_KEY);
  const num = parseFloat(val);
  return !isNaN(num) ? num : 3.5;
}

function deriveCreatedAt(data) {
  if (data.createdAt) return data.createdAt;
  if (data.date) {
    const datePart = data.date.replace('T', ' ');
    return datePart.includes(':') ? datePart : `${datePart} 13:00`;
  }
  const today = new Date().toISOString().slice(0, 10);
  return `${today} 13:00`;
}

async function loadRecords() {
  const snap = await db
    .collection('users')
    .doc(currentUser.uid)
    .collection('records')
    .get();
  records = [];
  for (const d of snap.docs) {
    const data = d.data();
    const createdAt = deriveCreatedAt(data);
    if (!data.createdAt) {
      await d.ref.update({ createdAt });
    }
    records.push({
      id: d.id,
      ...data,
      createdAt,
      profit: calculateProfit(data.spent, data.points, data.value),
    });
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  saveLocalRecords();
  renderRecords();
}

async function loadSettings() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  if (doc.exists && doc.data().pointCost !== undefined) {
    pointCost = doc.data().pointCost;
    costInput.value = pointCost.toString();
    saveLocalPointCost();
  }
}

async function addRecord(record) {
  const rec = { ...record, createdAt: record.createdAt || getCurrentDatetime() };
  const ref = await db
    .collection('users')
    .doc(currentUser.uid)
    .collection('records')
    .add(rec);
  rec.id = ref.id;
  rec.profit = calculateProfit(rec.spent, rec.points, rec.value);
  records.push(rec);
  saveLocalRecords();
  renderRecords();
}

async function updateRecord(id, record) {
  await db
    .collection('users')
    .doc(currentUser.uid)
    .collection('records')
    .doc(id)
    .set(record);
  const idx = records.findIndex((r) => r.id === id);
  if (idx > -1) {
    records[idx] = {
      id,
      ...record,
      profit: calculateProfit(record.spent, record.points, record.value),
    };
  }
  saveLocalRecords();
  renderRecords();
}

async function removeRecord(id) {
  await db
    .collection('users')
    .doc(currentUser.uid)
    .collection('records')
    .doc(id)
    .delete();
  const idx = records.findIndex((r) => r.id === id);
  if (idx > -1) records.splice(idx, 1);
  saveLocalRecords();
  renderRecords();
}

async function savePointCost() {
  await db.collection('users').doc(currentUser.uid).set(
    { pointCost },
    { merge: true }
  );
  saveLocalPointCost();
}

firebase.auth().onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userEmailEl.textContent = user.email || '';
    await loadSettings();
    await loadRecords();
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userEmailEl.textContent = '';
    records = loadLocalRecords();
    pointCost = loadLocalPointCost();
    costInput.value = pointCost.toString();
    filterText = '';
    filterMonth = '';
    filterInput.value = '';
    monthFilter.value = '';
    renderRecords();
  }
});

function clearForm() {
  dateInput.value = '';
  storeInput.value = '';
  spentInput.value = '';
  pointsInput.value = '';
  valueInput.value = '';
}

function renderRecords() {
  tbody.innerHTML = '';
  const filtered = records
    .filter((r) =>
      r.store.toLowerCase().includes(filterText) &&
      (!filterMonth || r.date.startsWith(filterMonth))
    )
    .slice()
    .sort((a, b) => {
      if (sortField === 'profit') {
        return b.profit - a.profit;
      }
      if (sortField === 'date') {
        return b.date.localeCompare(a.date);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  let totalSpent = 0;
  let totalPoints = 0;
  let totalValue = 0;
  let totalProfit = 0;
  const fragment = document.createDocumentFragment();
  filtered.forEach((rec, index) => {
    totalSpent += rec.spent;
    totalPoints += rec.points;
    totalValue += rec.value;
    totalProfit += rec.profit;
    const profitDisplay = formatProfit(rec.profit);
    const tr = document.createElement('tr');
    tr.className = 'table-row hover:bg-white/10 transition-all duration-300';
    tr.innerHTML = `
      <td class="text-white/90 px-4 py-3">${rec.createdAt}</td>
      <td class="text-white/90 px-4 py-3">${rec.date}</td>
      <td class="text-white/90 px-4 py-3">${rec.store}</td>
      <td class="text-white/90 px-4 py-3">$${rec.spent}</td>
      <td class="text-white/90 px-4 py-3">${rec.points}</td>
      <td class="text-white/90 px-4 py-3">$${rec.value}</td>
      <td class="px-4 py-3">${profitDisplay}</td>
      <td class="px-4 py-3 text-center">
        <button class="edit-btn bg-blue-500/80 hover:bg-blue-600 text-white px-3 py-1 rounded-lg mr-2 transition-all duration-200 hover:scale-105" data-id="${rec.id}">✏️ 編輯</button>
        <button class="delete-btn bg-red-500/80 hover:bg-red-600 text-white px-3 py-1 rounded-lg transition-all duration-200 hover:scale-105" data-id="${rec.id}">🗑️ 刪除</button>
      </td>`;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  totalSpentEl.textContent = '$' + totalSpent.toFixed(2);
  totalPointsEl.textContent = totalPoints.toFixed(2);
  totalValueEl.textContent = '$' + totalValue.toFixed(2);
  totalProfitEl.innerHTML = formatProfit(totalProfit);
}

// 新增/更新紀錄
saveBtn.addEventListener('click', async function() {
  const date = dateInput.value;
  const store = storeInput.value.trim();
  const spent = parseFloat(spentInput.value) || 0;
  const points = parseFloat(pointsInput.value) || 0;
  const value = parseFloat(valueInput.value) || 0;

  if (!date || !store) {
    alert('請填寫所有欄位');
    return;
  }

  const baseRecord = { date, store, spent, points, value };

  if (editingId) {
    const old = records.find((r) => r.id === editingId);
    await updateRecord(editingId, { ...baseRecord, createdAt: old.createdAt });
    editingId = null;
    saveBtn.innerHTML = '✨ 新增紀錄';
    showSuccessAnimation(saveBtn);
  } else {
    await addRecord(baseRecord);
    createCelebration();
    showSuccessAnimation(saveBtn);
  }
  clearForm();
});

costInput.addEventListener('change', async function () {
  const val = parseFloat(costInput.value);
  if (!isNaN(val)) {
    pointCost = val;
    await savePointCost();
    saveLocalPointCost();
    // Recalculate profit for existing records when point cost changes
    records = records.map((r) => ({
      ...r,
      profit: calculateProfit(r.spent, r.points, r.value),
    }));
    saveLocalRecords();
    renderRecords();
  }
});

filterInput.addEventListener('input', function () {
  filterText = filterInput.value.trim().toLowerCase();
  renderRecords();
});

monthFilter.addEventListener('change', function () {
  filterMonth = monthFilter.value;
  renderRecords();
});

sortSelect.addEventListener('change', function () {
  sortField = sortSelect.value;
  renderRecords();
});

// 編輯/刪除事件委派
tbody.addEventListener('click', async function(e) {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const rec = records.find((r) => r.id === id);
    dateInput.value = rec.date;
    storeInput.value = rec.store;
    spentInput.value = rec.spent;
    pointsInput.value = rec.points;
    valueInput.value = rec.value;
    editingId = rec.id;
    saveBtn.innerHTML = '💾 更新紀錄';
  } else if (e.target.classList.contains('delete-btn')) {
    const id = e.target.getAttribute('data-id');
    const rec = records.find((r) => r.id === id);
    if (confirm('確定要刪除此紀錄嗎？')) {
      await removeRecord(rec.id);
      if (editingId === rec.id) {
        editingId = null;
        saveBtn.innerHTML = '✨ 新增紀錄';
        clearForm();
      }
    }
  }
});

// 匯出 CSV
exportBtn.addEventListener('click', function() {
  let csvContent = "建立時間,日期,店名,花費金額,得到點數,商品價值,當日盈虧\n";
  records.forEach(rec => {
    csvContent += `${rec.createdAt},${rec.date},${rec.store},${rec.spent},${rec.points},${rec.value},${rec.profit}\n`;
  });
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "clawRecords.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
});

importInput.addEventListener('change', function() {
  const file = importInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function() {
    const lines = reader.result.split(/\r?\n/).filter((l) => l.trim());
    lines.slice(1).forEach((line) => {
      const [createdAt, date, store, spentStr, pointsStr, valueStr] = line.split(',');
      if (!date) return;
      const spent = parseFloat(spentStr) || 0;
      const points = parseFloat(pointsStr) || 0;
      const value = parseFloat(valueStr) || 0;
      addRecord({ date, store, spent, points, value, createdAt });
    });
    importInput.value = '';
  };
  reader.readAsText(file);
});
