/* Shared validation and the versioned CSV format; no Firebase or DOM access. */
const ClawLogData = (() => {
  const DEFAULT_POINT_COST = 3.5;
  const MAX_CSV_BYTES = 1024 * 1024;
  const MAX_CSV_RECORDS = 1000;
  const MAX_NUMBER = 1e12;
  const CSV_FORMAT = 'clawlog-v1';
  const CSV_HEADERS = [
    'format', 'date', 'store', 'spent', 'points', 'value', 'createdAt', 'profit',
  ];
  const HEADER_ALIASES = new Map([
    ['format', 'format'], ['date', 'date'], ['日期', 'date'],
    ['store', 'store'], ['店名', 'store'],
    ['spent', 'spent'], ['花費金額', 'spent'],
    ['points', 'points'], ['得到點數', 'points'],
    ['value', 'value'], ['商品價值', 'value'],
    ['createdAt', 'createdAt'], ['建立時間', 'createdAt'],
    ['profit', 'profit'], ['當日盈虧', 'profit'],
  ]);

  class ValidationError extends Error {}

  function finiteNumber(value, label, limit = MAX_NUMBER) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new ValidationError(`${label}必須是數字`);
    }
    if (typeof value === 'string' &&
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
      throw new ValidationError(`${label}必須是完整數字，不能空白`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit) {
      throw new ValidationError(`${label}必須是有限數字，絕對值不可超過 1 兆`);
    }
    return number;
  }

  function validDate(value, label = '日期') {
    if (typeof value !== 'string') {
      throw new ValidationError(`${label}格式不正確`);
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value);
    if (!match) throw new ValidationError(`${label}請使用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm`);
    const [, yearText, monthText, dayText, hour, minute, second] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 ||
        day > days[month - 1] || Number(hour || 0) > 23 ||
        Number(minute || 0) > 59 || Number(second || 0) > 59) {
      throw new ValidationError(`${label}不是有效日期或時間`);
    }
    return value.replace(' ', 'T');
  }

  function validatePointCost(value) {
    const number = finiteNumber(value, '點數成本');
    if (number < 0) throw new ValidationError('點數成本不可為負數');
    return number;
  }

  function validateRecord(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('紀錄格式不正確');
    }
    const date = validDate(data.date);
    if (typeof data.store !== 'string' || !data.store.trim() ||
        data.store.trim().length > 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data.store)) {
      throw new ValidationError('店名必須是 1 至 200 字的文字，不可包含控制字元');
    }
    return {
      date,
      store: data.store.trim(),
      spent: finiteNumber(data.spent, '花費金額'),
      points: finiteNumber(data.points, '得到點數'),
      value: finiteNumber(data.value, '商品價值'),
      createdAt: data.createdAt === undefined || data.createdAt === ''
        ? (date.includes('T') ? date : `${date}T13:00`)
        : validDate(data.createdAt, '建立時間'),
    };
  }

  function calculateProfit(record, pointCost) {
    return record.points * pointCost - record.spent + record.value;
  }

  function parseCsv(text) {
    if (typeof text !== 'string' ||
        new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
      throw new ValidationError('CSV 不可超過 1 MiB');
    }
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let started = false;
    let closed = false;
    function finishField() {
      row.push(field);
      field = '';
      started = false;
      closed = false;
    }
    function finishRow() {
      finishField();
      if (row.length !== 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length > MAX_CSV_RECORDS + 1) {
        throw new ValidationError('CSV 最多可匯入 1000 筆紀錄');
      }
    }
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
            closed = true;
          }
        } else {
          field += char;
        }
      } else if (char === ',') {
        finishField();
      } else if (char === '\n' || char === '\r') {
        finishRow();
        if (char === '\r' && text[index + 1] === '\n') index += 1;
      } else if (char === '"' && !started && !closed) {
        quoted = true;
        started = true;
      } else if (closed || char === '"') {
        throw new ValidationError('CSV 引號格式不正確');
      } else {
        field += char;
        started = true;
      }
    }
    if (quoted) throw new ValidationError('CSV 有未結束的引號');
    if (started || closed || row.length) finishRow();
    if (!rows.length) throw new ValidationError('CSV 缺少標頭');
    return rows;
  }

  function parseRecordsCsv(text) {
    const [header, ...rows] = parseCsv(text);
    const fields = header.map((name) => HEADER_ALIASES.get(name.trim()));
    if (fields.some((field) => !field) || new Set(fields).size !== fields.length ||
        ['date', 'store', 'spent', 'points', 'value'].some((field) => !fields.includes(field))) {
      throw new ValidationError('CSV 標頭不明或重複；需要日期、店名、花費金額、得到點數、商品價值');
    }
    if (!rows.length) throw new ValidationError('CSV 沒有紀錄');
    return rows.map((row, index) => {
      try {
        if (row.length !== fields.length) throw new ValidationError('欄位數量與標頭不符');
        const data = Object.fromEntries(fields.map((field, column) => [field, row[column]]));
        if (fields.includes('format')) {
          if (data.format !== CSV_FORMAT || !data.store.startsWith("'")) {
            throw new ValidationError('不支援的 CSV 版本或店名編碼');
          }
          // Every v1 store has one protective apostrophe, including literal apostrophes.
          data.store = data.store.slice(1);
        }
        if (fields.includes('profit')) finiteNumber(data.profit, '當日盈虧', Number.MAX_VALUE);
        return validateRecord(data);
      } catch (error) {
        throw new ValidationError(`CSV 第 ${index + 1} 筆：${error.message}`);
      }
    });
  }

  function csvCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportRecordsCsv(records, pointCost) {
    const cost = validatePointCost(pointCost);
    const rows = records.map((data) => {
      const record = validateRecord(data);
      return [
        CSV_FORMAT, record.date, "'" + record.store,
        record.spent, record.points, record.value, record.createdAt,
        calculateProfit(record, cost),
      ].map(csvCell).join(',');
    });
    return '\uFEFF' + [CSV_HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
  }

  return {
    DEFAULT_POINT_COST, MAX_CSV_BYTES, MAX_CSV_RECORDS, ValidationError,
    validateRecord, validatePointCost, calculateProfit, parseRecordsCsv,
    exportRecordsCsv,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClawLogData;
