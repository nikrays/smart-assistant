import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {build} = await import(pathToFileURL(join(root, 'frontend/node_modules/esbuild/lib/main.js')));
const folder = await mkdtemp(join(tmpdir(), 'sa-pages-check-'));
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
try {
  await build({entryPoints: [join(root, 'frontend/src/pagesDemo.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(folder, 'demo.mjs')});
  const {createPagesDemo, pagesDemoStorage} = await import(pathToFileURL(join(folder, 'demo.mjs')));
  const originStorage = new MemoryStorage(), storage = pagesDemoStorage(originStorage, '/smart-assistant/');
  originStorage.setItem('another-app', 'untouched');
  const clock = () => new Date('2026-12-15T09:00:00Z');
  let demo = createPagesDemo(storage, clock);
  const call = async (path, method = 'GET', body, status = 200, headers) => {
    const response = await demo.request('/api' + path, {method, ...(body === undefined ? {} : {body: JSON.stringify(body)}), headers});
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
    return result;
  };
  const startup = await call('/startup');
  assert.equal(startup.session.user.role, 'admin');
  assert.equal(startup.bootstrap.capabilities.ai, false);
  assert.equal(startup.meta.capabilities.speech, false);
  for (const resource of startup.meta.resources) {
    const listed = await call('/' + resource.key + '?limit=1');
    assert.ok(Array.isArray(listed.items), resource.key);
    if (listed.items.length) assert.equal((await call('/' + resource.key + '/' + listed.items[0].id)).id, listed.items[0].id);
  }
  for (const path of ['/dashboard', '/calendar', '/insights?days=14', '/reports/summary', '/personal/summary', '/journal?day=2026-12-15', '/maintenance/overview', '/field-map', '/local-references', '/activity', '/knowledge/search?q=учеб', '/integrations', '/notifications', '/accounts', '/auth/profile', '/speech/jobs']) await call(path);
  const crudStorage = new MemoryStorage(), crud = createPagesDemo(crudStorage, clock);
  for (const resource of startup.meta.resources) {
    const example = startup.bootstrap.lookups[resource.key][0] || (resource.key === 'messages' ? {task_id: null, recipient_id: startup.bootstrap.lookups.people[0].id, text: 'Учебный текст сообщения', status: 'draft'} : {});
    const writable = Object.fromEntries(resource.fields.filter(field => !field.readOnly && example[field.key] !== undefined).map(field => [field.key, structuredClone(example[field.key])]));
    const createdResponse = await crud.request('/api/' + resource.key, {method: 'POST', body: JSON.stringify(writable)});
    const created = await createdResponse.json();
    assert.ok([201, 422].includes(createdResponse.status), `create ${resource.key}: ${JSON.stringify(created)}`);
    if (createdResponse.status === 201) {
      assert.ok(created.id > 0 && created.version === 1 && !created.archived);
      const patchedResponse = await crud.request('/api/' + resource.key + '/' + created.id, {method: 'PATCH', body: JSON.stringify({version: created.version, ...writable})});
      assert.ok([200, 422].includes(patchedResponse.status), `patch ${resource.key}: ${await patchedResponse.text()}`);
    }
    const invalid = await crud.request('/api/' + resource.key, {method: 'POST', body: JSON.stringify({unknown_demo_field: 'invalid'})});
    assert.equal(invalid.status, 422, `invalid create ${resource.key}`);
  }
  for (const [resource, data] of [['assets', {name: 'Неверная схема', kind: 'field', details: []}], ['maintenance_rules', {name: 'Неверные расходники', asset_id: startup.bootstrap.lookups.assets.find(row => row.kind === 'equipment').id, interval_hours: '10', baseline_hours: '0', parts: [null]}], ['people', {name: {invalid: true}}], ['tasks', {title: 'Неверная дата', due_date: '2026-02-31'}]]) {
    const response = await crud.request('/api/' + resource, {method: 'POST', body: JSON.stringify(data)});
    assert.equal(response.status, 422, `${resource}: ${await response.text()}`);
  }
  assert.ok((await call('/personal/summary')).counts.today > 0, 'fixture dates follow the visit date');

  const parsed = await call('/assistant/interpret', 'POST', {text: 'Создай задачу завтра срочно купить масло', scope: 'personal'});
  assert.equal(parsed.draft.due_date, '2026-12-16');
  assert.equal(parsed.draft.priority, 'high');
  const task = await call('/tasks', 'POST', parsed.draft, 201);
  demo = createPagesDemo(storage, clock);
  assert.equal((await call('/tasks/' + task.id)).title, parsed.draft.title, 'task survives a reload');
  await call('/tasks/' + task.id, 'PATCH', {version: task.version - 1, title: 'stale'}, 409);
  const completed = await call('/tasks/' + task.id + '/complete', 'POST', {version: task.version});
  assert.equal(completed.status, 'completed');
  assert.ok(!(await call('/personal/summary')).reminders.some(row => row.task.id === task.id));
  const recurring = await call('/tasks', 'POST', {title: 'Ежемесячный осмотр', due_date: '2026-01-31', recurrence: 'monthly'}, 201);
  const recurrence = await call('/tasks/' + recurring.id + '/complete', 'POST', {version: recurring.version});
  assert.equal((await call('/tasks/' + recurrence.next_task_id)).due_date, '2026-02-28');
  assert.equal((await call('/tasks/' + recurring.id + '/complete', 'POST', {version: recurring.version})).id, recurring.id);

  const person = startup.bootstrap.lookups.people[0], asset = startup.bootstrap.lookups.assets.find(row => row.kind === 'equipment');
  let work = await call('/worklogs', 'POST', {title: 'Учебная работа из теста', worked_on: '2026-12-15', person_id: person.id, asset_id: asset.id, hours: '2.5', quantity: '1', unit: 'га'}, 201);
  assert.equal(work.review_status, 'draft');
  await call('/worklogs/' + work.id + '/timesheet', 'POST', {version: work.version}, 422);
  work = await call('/worklogs/' + work.id + '/approve', 'POST', {version: work.version});
  const sheet = await call('/worklogs/' + work.id + '/timesheet', 'POST', {version: work.version});
  assert.equal(sheet.timesheet.amount, (Number(person.hourly_rate) * 2.5).toFixed(2));
  const sameSheet = await call('/worklogs/' + work.id + '/timesheet', 'POST', {version: work.version});
  assert.equal(sameSheet.timesheet.id, sheet.timesheet.id);
  assert.equal(sameSheet.reused, true);
  await call('/worklogs/' + work.id, 'PATCH', {version: work.version, hours: '3'}, 422);
  work = await call('/worklogs/' + work.id + '/reopen', 'POST', {version: work.version});
  assert.equal((await call('/worklogs/' + work.id + '/workflow')).timesheet_stale, true);
  work = await call('/worklogs/' + work.id, 'PATCH', {version: work.version, hours: '3'});
  work = await call('/worklogs/' + work.id + '/approve', 'POST', {version: work.version});
  assert.equal((await call('/worklogs/' + work.id + '/timesheet', 'POST', {version: work.version, refresh: true, timesheet_version: sheet.timesheet.version})).timesheet.amount, (Number(person.hourly_rate) * 3).toFixed(2));
  assert.ok((await call('/journal?day=2026-12-15')).rows.some(row => row.id === work.id));

  const gear = (await call('/maintenance/overview')).equipment.find(item => item.rules.some(rule => rule.parts.length));
  const rule = gear.rules[0];
  const reading = await call('/meter_readings', 'POST', {asset_id: gear.asset.id, reading_on: '2026-12-15', value: rule.next_service_hours}, 201);
  assert.equal((await call('/maintenance/assets/' + gear.asset.id)).rules[0].state, 'due');
  await call('/meter_readings', 'POST', {asset_id: gear.asset.id, reading_on: '2026-12-14', value: '1'}, 422);
  const supplies = await Promise.all(rule.parts.map(part => call('/stock/' + part.stock_id)));
  const completion = {version: rule.version, reading_id: reading.id, performed_on: '2026-12-15', works: 'Заменены учебные масло и фильтр', person_id: person.id, hours: '1', materials: rule.parts.map(({stock_id, quantity}) => ({stock_id, quantity})), idempotency_key: 'test-maintenance-001'};
  await call('/maintenance/rules/' + rule.id + '/complete', 'POST', {...completion, materials: [{stock_id: supplies[0].id, quantity: '999999'}]}, 422);
  assert.equal((await call('/stock/' + supplies[0].id)).quantity, supplies[0].quantity, 'failed TO does not change stock');
  const service = await call('/maintenance/rules/' + rule.id + '/complete', 'POST', completion);
  assert.equal(service.worklog.review_status, 'approved');
  assert.ok(service.timesheet);
  assert.equal(service.movements.length, supplies.length);
  assert.equal((await call('/maintenance/assets/' + gear.asset.id)).rules[0].state, 'okay');
  const repeatedService = await call('/maintenance/rules/' + rule.id + '/complete', 'POST', completion);
  assert.equal(repeatedService.service.id, service.service.id);
  assert.equal(repeatedService.reused, true);
  for (const [index, supply] of supplies.entries()) assert.equal(Number((await call('/stock/' + supply.id)).quantity), Number(supply.quantity) - Number(rule.parts[index].quantity));
  assert.ok(Number((await call('/worklogs/' + service.worklog.id + '/workflow')).materials_cost) > 0);

  const draftInput = {expected_version: 0, generation: 1, kind: 'record', resource: 'tasks', record_id: null, base_version: null, title: 'Черновик', data: {title: 'Задача из черновика'}, context: {form: 'record:tasks', page: 'personal'}};
  const draft = await call('/drafts/test-cas', 'PUT', draftInput);
  await call('/drafts/test-cas', 'PUT', draftInput, 409);
  demo = createPagesDemo(storage, clock);
  assert.equal((await call('/drafts/test-cas')).data.title, draftInput.data.title);
  const draftHeaders = {'X-Draft-Key': 'test-cas', 'X-Draft-Version': String(draft.version)};
  const saved = await call('/tasks', 'POST', {title: 'Задача из черновика'}, 201, draftHeaders);
  const replayed = await call('/tasks', 'POST', {title: 'Задача из черновика'}, 201, draftHeaders);
  assert.equal(saved.id, replayed.id, 'committed draft replays the original receipt');
  await call('/tasks', 'POST', {title: 'Другой текст'}, 409, draftHeaders);
  assert.equal((await call('/drafts/test-cas')).status, 'committed');
  await call('/drafts/discard-before-first-save?expected_version=0', 'DELETE');
  await call('/drafts/discard-before-first-save', 'PUT', draftInput, 409);
  assert.ok(!(await call('/drafts')).items.some(item => item.key === 'test-cas'));
  const field = (await call('/field-map')).fields[0];
  const mapDraft = await call('/drafts/test-map', 'PUT', {...draftInput, resource: 'assets', record_id: field.id, base_version: field.version, data: {details: {map_pin: {x: 0.4, y: 0.5}}}});
  const movedField = await call('/field-map/assign', 'POST', {asset_id: field.id, version: field.version, x: 0.4, y: 0.5}, 200, {'X-Draft-Key': 'test-map', 'X-Draft-Version': String(mapDraft.version)});
  assert.equal(movedField.details.map_pin.x, 0.4);
  assert.equal((await call('/field-map/assign', 'POST', {asset_id: field.id, version: movedField.version, clear: true})).details.map_pin, null);

  const exact = await call('/calculations/preview', 'POST', {kind: 'cost', inputs: {lines: [{name: 'Десятичный пример', quantity: '0.1', unit_cost: '0.2'}, {name: 'Ещё статья', quantity: '0.2', unit_cost: '0.2'}], output_quantity: '1', markup_percent: '0'}});
  assert.equal(exact.result.total_cost, '0.06');
  const payroll = await call('/calculations/preview', 'POST', {kind: 'payroll', inputs: {hours: '10', rate: '100', tax_percent: '13', contribution_percent: '30'}});
  assert.equal(payroll.result.net, '870.00');
  assert.equal(payroll.result.employer_cost, '1300.00');
  await call('/calculations/preview', 'POST', {kind: 'cost', inputs: {lines: [{quantity: '1', unit_cost: '1'}], output_quantity: '0'}}, 422);
  const ledger = await call('/calculations/preview', 'POST', {kind: 'operation_cost', inputs: {start: '2026-12-01', end: '2026-12-31', output_quantity: '10'}});
  assert.ok(ledger.source_snapshot.records.some(row => row.id === work.id));
  assert.ok(Number(ledger.result.labor_cost) > 0);
  const calc = await call('/calculations', 'POST', {kind: 'cost', title: 'Сохранённый расчёт', inputs: {lines: [{name: 'Учебный расход', quantity: '3', unit_cost: '10'}], output_quantity: '2', markup_percent: '0'}}, 201);
  assert.equal(calc.result.unit_cost, '15.00');

  for (const currentPage of ['personal', 'journal', 'maintenance', 'field-scheme', 'people', 'stock', 'reports']) await call('/navigation', 'PATCH', {action: 'visit', page: currentPage});
  assert.equal((await call('/navigation')).opened.length, 6);
  await call('/navigation', 'PATCH', {action: 'favorite', page: 'personal'});
  await call('/preferences', 'PATCH', {guide: {status: 'paused', page: 'journal', step: 2}});
  demo = createPagesDemo(storage, clock);
  assert.ok((await call('/navigation')).favorites.includes('personal'));
  assert.equal((await call('/preferences')).guide.step, 2);
  assert.ok((await call('/search?q=' + encodeURIComponent('Задача из черновика'))).items.some(row => row.id === saved.id));

  await call('/tasks', 'POST', {title: '=HYPERLINK("https://invalid.example")'}, 201);
  const csv = await (await demo.request('/api/exports/tasks.csv')).text();
  assert.ok(csv.includes("'=HYPERLINK"), 'CSV escapes spreadsheet formula injection');
  const xlsx = await demo.request('/api/exports/report.xlsx');
  assert.equal(xlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(new Uint8Array(await xlsx.arrayBuffer())[0], 80, 'XLSX example is a real ZIP workbook');
  const beforeSecret = originStorage.getItem(originStorage.key(1));
  await call('/notifications/telegram', 'PATCH', {token: 'never-persist-this-secret'}, 422);
  assert.ok(![...originStorage.values.values()].some(value => value.includes('never-persist-this-secret')));
  assert.equal(originStorage.getItem(originStorage.key(1)), beforeSecret);
  await call('/unknown-server-action', 'POST', {}, 422);
  await call('/auth/logout', 'POST', {});
  await call('/startup', 'GET', undefined, 401);
  await call('/auth/login', 'POST', {});
  await call('/startup');
  const denied = new MemoryStorage(); denied.setItem = () => { throw Error('quota'); };
  const noSpace = createPagesDemo(denied, clock);
  assert.equal((await noSpace.request('/api/tasks', {method: 'POST', body: JSON.stringify({title: 'Не сохранится'})})).status, 507);
  assert.equal((await (await noSpace.request('/api/tasks?q=' + encodeURIComponent('Не сохранится'))).json()).total, 0);
  storage.setItem('sa-draft-outbox-v1:demo', '{}');
  demo.reset();
  assert.equal(originStorage.getItem('another-app'), 'untouched');
  assert.equal(storage.length, 0, 'reset removes only this repository demo and outbox');
  assert.equal((await call('/tasks?q=' + encodeURIComponent('Задача из черновика'))).total, 0);
  assert.equal(pagesDemoStorage(originStorage, '/smart-assistant/index.html').length, storage.length);
  console.log('PASS pages demo: 16 resource contracts; persistence; tasks; worklog approval/timesheets; maintenance/stock atomicity/idempotency; decimal math; drafts CAS/receipt/tombstone; search/navigation; CSV/XLSX; secrets blocked; scoped reset; storage failure.');
} finally { await rm(folder, {recursive: true, force: true}); }
