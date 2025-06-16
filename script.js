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

async function loadRecords() {
  const snap = await db
    .collection('users')
    .doc(currentUser.uid)
    .collection('records')
    .orderBy('createdAt', 'desc')
    .get();
  records = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt || getCurrentDatetime();
    return {
      id: d.id,
      ...data,
      createdAt,
      profit: calculateProfit(data.spent, data.points, data.value),
    };
  });
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
    tr.className = index % 2 ? 'even:bg-gray-50' : 'odd:bg-white';
    tr.innerHTML = `
      <td class="border px-4 py-1">${rec.createdAt}</td>
      <td class="border px-4 py-1">${rec.date}</td>
      <td class="border px-4 py-1">${rec.store}</td>
      <td class="border px-4 py-1">${rec.spent}</td>
      <td class="border px-4 py-1">${rec.points}</td>
      <td class="border px-4 py-1">${rec.value}</td>
      <td class="border px-4 py-1">${profitDisplay}</td>
      <td class="border px-4 py-1 text-center">
        <button class="edit-btn text-blue-600 mr-2" data-id="${rec.id}">編輯</button>
        <button class="delete-btn text-red-600" data-id="${rec.id}">刪除</button>
      </td>`;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  totalSpentEl.textContent = totalSpent.toFixed(2);
  totalPointsEl.textContent = totalPoints.toFixed(2);
  totalValueEl.textContent = totalValue.toFixed(2);
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
    saveBtn.textContent = '新增紀錄';
  } else {
    await addRecord(baseRecord);
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
    saveBtn.textContent = '更新紀錄';
  } else if (e.target.classList.contains('delete-btn')) {
    const id = e.target.getAttribute('data-id');
    const rec = records.find((r) => r.id === id);
    if (confirm('確定要刪除此紀錄嗎？')) {
      await removeRecord(rec.id);
      if (editingId === rec.id) {
        editingId = null;
        saveBtn.textContent = '新增紀錄';
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
