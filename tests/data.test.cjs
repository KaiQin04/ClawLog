const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../data.js');

const record = (overrides = {}) => ({
  date: '2026-10-15T12:30', store: 'Test store', spent: 20,
  points: 5, value: 0, createdAt: '2026-10-15T12:31', ...overrides,
});
const oldHeader = '日期,店名,花費金額,得到點數,商品價值,當日盈虧\n';

test('validation rejects invalid dates, store types, empty/partial/nonfinite numbers', () => {
  for (const changes of [
    { date: '<img src=x onerror=alert(1)>' }, { date: '2026-02-29' },
    { date: '2026-04-31T12:00' }, { date: '2026-10-15T24:00' },
    { date: '0000-01-01' }, { store: null }, { store: '' },
    { store: 'x'.repeat(201) }, { store: 'a\0b' }, { spent: '' },
    { spent: '12abc' }, { spent: Infinity }, { value: NaN },
    { points: true }, { points: '0x10' }, { points: 1e13 },
    { createdAt: {} },
  ]) assert.throws(() => data.validateRecord(record(changes)), data.ValidationError);
  assert.equal(data.validateRecord(record({ date: '2024-02-29 12:30' })).date,
    '2024-02-29T12:30');
  assert.equal(data.validateRecord(record({ spent: '-20.5' })).spent, -20.5);
  assert.throws(() => data.validatePointCost(-1), data.ValidationError);
  assert.throws(() => data.validatePointCost(Infinity), data.ValidationError);
});

test('versioned CSV round trips quotes, commas, newlines, formulas and apostrophes', () => {
  const stores = [
    'Store, "quoted"\nsecond line', "'original", "''two", '=SUM(1,2)',
    '+cmd', '-text', '@formula', '正常店名',
  ];
  const input = stores.map((store) => record({ store, spent: -10.25, value: -2 }));
  const csv = data.exportRecordsCsv(input, 3.5);
  assert.deepEqual(data.parseRecordsCsv(csv), input);
  for (const store of stores) assert.ok(csv.includes("'" + store.replace(/"/g, '""')));
  assert.ok(csv.includes(',-10.25,5,-2,'));
  assert.ok(!csv.includes(",'" + '-10.25'));
  const extreme = record({ points: 1e12, value: 1e12, spent: -1e12 });
  assert.deepEqual(data.parseRecordsCsv(data.exportRecordsCsv([extreme], 1e12)), [extreme]);
});

test('known legacy headers map by name and preserve literal leading apostrophes', () => {
  const csv = oldHeader + '2026-10-15,\'literal,-2,3,4,16.5\n';
  assert.deepEqual(data.parseRecordsCsv(csv)[0], record({
    date: '2026-10-15', store: "'literal", spent: -2, points: 3,
    value: 4, createdAt: '2026-10-15T13:00',
  }));
  const oldCreated = '建立時間,日期,店名,花費金額,得到點數,商品價值,當日盈虧\r\n' +
    '2026-10-14 13:00,2026-10-15,Legacy,1,2,3,9\r\n';
  assert.equal(data.parseRecordsCsv(oldCreated)[0].createdAt, '2026-10-14T13:00');
  const reordered = 'value,store,points,date,spent\n3,"Store, A",2,2026-10-15,1\n';
  assert.equal(data.parseRecordsCsv(reordered)[0].store, 'Store, A');
});

test('ambiguous headers, malformed quotes and bad rows fail the whole import', () => {
  for (const csv of [
    '2026-10-15,Store,1,2,3\n',
    'date,store,spent,points,value,unknown\n2026-10-15,Store,1,2,3,x\n',
    'date,日期,store,spent,points,value\n2026-10-15,2026-10-15,Store,1,2,3\n',
    oldHeader + '2026-10-15,"unclosed,1,2,3,4\n',
    oldHeader + '2026-10-15,"closed"junk,1,2,3,4\n',
    oldHeader + '2026-10-15,un"quoted,1,2,3,4\n',
    oldHeader + '2026-10-15,Store,1,2,3\n',
    oldHeader + '2026-10-15,Store,1,2,3,4\n2026-02-30,Store,1,2,3,4\n',
    'format,date,store,spent,points,value\nclawlog-v2,2026-10-15,\'Store,1,2,3\n',
    'format,date,store,spent,points,value\nclawlog-v1,2026-10-15,Store,1,2,3\n',
  ]) assert.throws(() => data.parseRecordsCsv(csv), data.ValidationError);
});

test('CSV limits enforce UTF-8 bytes and 1000 data rows', () => {
  const row = '2026-10-15,Store,1,2,3,4\n';
  assert.equal(data.parseRecordsCsv(oldHeader + row.repeat(1000)).length, 1000);
  assert.throws(() => data.parseRecordsCsv(oldHeader + row.repeat(1001)), /1000/);
  assert.throws(() => data.parseRecordsCsv('店'.repeat(350000)), /1 MiB/);
  assert.throws(() => data.parseRecordsCsv('x'.repeat(data.MAX_CSV_BYTES + 1)), /1 MiB/);
});
