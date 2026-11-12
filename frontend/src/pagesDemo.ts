import Decimal from 'decimal.js';
import seedData from './pages-demo-data.json';
import { pagesDemoStorage } from './pagesDemoStorage';

export { pagesDemoStorage } from './pagesDemoStorage';

// This module runs only in the public, static demo. It never contacts an API server.
type Row = Record<string, any>;
type State = { schemaVersion: number; sequence: number; session: Row | null; workspace: Row; records: Record<string, Row[]>; movements: Row[]; drafts: Record<string, Row>; receipts: Record<string, Row>; preferences: Row; navigation: Row; activity: Row[]; generation: number };
const seed = seedData as unknown as {schemaVersion: number; anchorDay: string; session: Row; workspace: Row; meta: Row; records: Record<string, Row[]>; movements?: Row[]; integrations: Row; notifications: Row; reportXlsxBase64: string};
const clone = <T>(value: T): T => structuredClone(value);
const notice = 'Учебные данные. Изменения хранятся только в этом браузере. Внешние сервисы не подключены.';
const capabilities = {ai: false, speech: false, outbound_enabled: false};
function fault(status: number, message: string): never { throw Object.assign(new Error(message), {status}); }
const number = (value: unknown, minimum = 0): Decimal => {
  try { const result = new Decimal(String(value ?? '').replace(',', '.')); if (result.isFinite() && result.gte(minimum) && result.abs().lte('1000000000000')) return result; } catch { /* Return one readable validation error. */ }
  return fault(422, 'Проверь числовое значение. Допустимо от ' + minimum + ' до 1 000 000 000 000.');
};
const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const sum = (rows: Row[], key: string) => rows.reduce<Decimal>((total, row) => total.plus(String(row[key] ?? 0)), new Decimal(0));
const title = (row: Row) => String(row.title || row.name || row.operation || 'Запись №' + row.id);
const fingerprint = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const dayOf = (date: Date) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
const plusDays = (day: string, amount: number) => new Date(Date.parse(day + 'T12:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
const safeText = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});

function initialState(today: string): State {
  const delta = Math.round((Date.parse(today) - Date.parse(seed.anchorDay)) / 86400000);
  const dateFields = new Set(['due_date', 'remind_at', 'worked_on', 'work_date', 'reading_on', 'performed_on', 'occurred_on', 'approved_at', 'completed_at', 'started_on', 'deadline', 'starts_at', 'ends_at', 'created_at', 'updated_at']);
  const records = clone(seed.records), movements = clone(seed.movements || []);
  for (const rows of [...Object.values(records), movements]) for (const row of rows) for (const key of Object.keys(row)) {
    if (dateFields.has(key) && typeof row[key] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row[key])) row[key] = plusDays(row[key].slice(0, 10), delta) + row[key].slice(10);
  }
  return {schemaVersion: seed.schemaVersion, sequence: Math.max(0, ...Object.values(records).flat().map(row => row.id)), session: clone(seed.session), workspace: clone(seed.workspace), records, movements, drafts: {}, receipts: {}, preferences: {status: 'skipped', step: 0, tour_step: 0}, navigation: {version: 0, opened: ['today'], favorites: [], sections: {}, active: 'today'}, activity: [], generation: 1};
}

export function createPagesDemo(storage: Storage, now: () => Date = () => new Date()) {
  let state: State;
  const today = () => dayOf(now());
  const load = () => {
    const raw = storage.getItem('state');
    if (!raw) { state = initialState(today()); return; }
    try { const parsed = JSON.parse(raw); if (parsed.schemaVersion !== seed.schemaVersion || !parsed.records || !parsed.drafts) throw Error(); state = parsed; }
    catch { fault(500, 'Не удалось прочитать сохранённую демку. Скачай нужные данные и сбрось демо кнопкой в шапке.'); }
  };
  load();
  const active = (resource: string) => (state.records[resource] || []).filter(row => !row.archived);
  const get = (resource: string, id: unknown) => (state.records[resource] || []).find(row => row.id === Number(id)) || fault(404, 'Запись не найдена.');
  const checkVersion = (row: Row, version: unknown) => { if (row.version !== version) fault(409, 'Запись уже изменена. Открой её заново и проверь данные.'); };
  const update = (row: Row, changes: Row) => Object.assign(row, changes, {version: row.version + 1, updated_at: now().toISOString()});
  const add = (resource: string, body: Row) => {
    const row = {...body, id: ++state.sequence, version: 1, archived: false, created_at: now().toISOString(), updated_at: now().toISOString()};
    (state.records[resource] ||= []).push(row); return row;
  };
  const page = (rows: Row[], params: URLSearchParams) => {
    const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0)), limit = Math.min(200, Math.max(1, Math.floor(Number(params.get('limit')) || 50)));
    return {items: rows.slice(offset, offset + limit), total: rows.length, offset, limit};
  };
  const filterRows = (resource: string, params: URLSearchParams) => {
    let rows = state.records[resource] || [];
    rows = rows.filter(row => params.get('archived') === 'true' ? row.archived : !row.archived);
    for (const [key, value] of params) {
      if (key === 'q' && value) rows = rows.filter(row => safeText(JSON.stringify(row)).includes(safeText(value)));
      else if (!['q', 'archived', 'offset', 'limit', 'sort', 'order'].includes(key) && value) rows = rows.filter(row => String(row[key] ?? '') === value);
    }
    return rows.sort((a, b) => b.id - a.id);
  };
  const bootstrap = () => ({lookups: Object.fromEntries(Object.keys(state.records).map(resource => [resource, active(resource)])), settings: state.workspace, capabilities});
  const latestReading = (assetId: unknown) => active('meter_readings').filter(row => row.asset_id === Number(assetId)).sort((a, b) => String(b.reading_on).localeCompare(String(a.reading_on)) || b.id - a.id)[0] ?? null;
  const maintenanceRule = (rule: Row) => {
    const services = active('maintenance_services').filter(row => row.rule_id === rule.id).sort((a, b) => String(b.performed_on).localeCompare(String(a.performed_on)) || b.id - a.id);
    const latest = services[0] || null, reading = latestReading(rule.asset_id);
    const next = number(latest?.meter_value ?? rule.baseline_hours).plus(number(rule.interval_hours));
    const remaining = reading ? next.minus(number(reading.value)) : null;
    return {...rule, latest_service: latest, next_service_hours: next.toString(), remaining_hours: remaining?.toString() ?? null, state: !rule.enabled ? 'disabled' : !remaining ? 'unknown' : remaining.lt(0) ? 'overdue' : remaining.lte(number(rule.warning_hours || 0)) ? 'due' : 'okay', parts: (rule.parts || []).map((part: Row) => { const stock = get('stock', part.stock_id); return {...part, stock_name: stock.name, available: stock.quantity, unit: stock.unit, sufficient: !stock.archived && number(stock.quantity).gte(number(part.quantity))}; })};
  };
  const equipment = (asset: Row) => {
    const readings = active('meter_readings').filter(row => row.asset_id === asset.id).sort((a, b) => String(b.reading_on).localeCompare(String(a.reading_on)) || b.id - a.id);
    const services = active('maintenance_services').filter(row => row.asset_id === asset.id).sort((a, b) => b.id - a.id);
    return {asset, latest_reading: readings[0] ?? null, readings: readings.slice(0, 100), reading_total: readings.length, rules: active('maintenance_rules').filter(row => row.asset_id === asset.id).map(maintenanceRule), services: services.slice(0, 100), service_total: services.length};
  };
  const isStale = (sheet: Row, work: Row) => sheet.source_worklog_version !== work.version || work.review_status !== 'approved';
  const workflow = (work: Row) => {
    const sheet = active('timesheets').find(row => row.source_worklog_id === work.id) || null;
    const movements = state.movements.filter(row => row.worklog_id === work.id);
    const stale = !!sheet && isStale(sheet, work);
    return {worklog: work, timesheet: sheet, timesheet_stale: stale, movements, materials_cost: money(sum(movements.filter(row => row.direction === 'out'), 'total_cost')), labor_cost: sheet && !stale ? sheet.amount : null, notice: 'Материалы берутся из движений склада, труд - из актуального связанного табеля. ' + notice};
  };
  const tabulate = (work: Row, body: Row) => {
    checkVersion(work, body.version);
    if (work.review_status !== 'approved') fault(422, 'Сначала подтверди работу.');
    if (!work.person_id) fault(422, 'Укажи сотрудника в работе.');
    const old = active('timesheets').find(row => row.source_worklog_id === work.id);
    if (old && !body.refresh) return {timesheet: old, reused: true, stale: isStale(old, work)};
    if (old) checkVersion(old, body.timesheet_version);
    const rate = number(body.rate ?? get('people', work.person_id).hourly_rate);
    const data = {person_id: work.person_id, work_date: work.worked_on, hours: String(work.hours), rate: rate.toString(), amount: money(rate.times(number(work.hours))), source_worklog_id: work.id, source_worklog_version: work.version, notes: 'Из журнала работ: ' + work.title};
    return {timesheet: old ? update(old, data) : add('timesheets', data), reused: false, stale: false};
  };
  const moveStock = (stock: Row, body: Row) => {
    if (!['in', 'out'].includes(body.direction)) fault(422, 'Выбери приход или расход.');
    const quantity = number(body.quantity); if (!quantity.gt(0)) fault(422, 'Количество должно быть больше нуля.');
    if (stock.archived) fault(422, 'Запас находится в архиве.');
    if (!body.idempotency_key || String(body.idempotency_key).length < 8) fault(422, 'Отсутствует идентификатор операции. Открой форму заново.');
    const signature = fingerprint({...body, stock_id: stock.id}), old = state.movements.find(row => row.idempotency_key === body.idempotency_key);
    if (old) { if (old.signature !== signature) fault(409, 'Идентификатор уже использован для другого движения.'); return old; }
    if (body.worklog_id && get('worklogs', body.worklog_id).review_status !== 'approved') fault(422, 'Сначала подтверди работу.');
    const next = number(stock.quantity)[body.direction === 'in' ? 'plus' : 'minus'](quantity);
    if (next.lt(0)) fault(422, 'Недостаточно остатка на складе.');
    const cost = number(body.unit_cost ?? stock.unit_cost ?? 0);
    const row = {...body, quantity: quantity.toString(), unit_cost: cost.toString(), total_cost: money(quantity.times(cost)), stock_id: stock.id, stock_name: stock.name, unit: stock.unit, signature, id: ++state.sequence, created_at: now().toISOString()};
    state.movements.push(row); update(stock, {quantity: next.toString()}); return row;
  };
  const completeMaintenance = (rule: Row, body: Row) => {
    const receipt = state.receipts['maintenance:' + body.idempotency_key], signature = fingerprint({rule_id: rule.id, ...body});
    if (receipt) { if (receipt.signature !== signature) fault(409, 'Идентификатор ТО уже использован.'); return {...receipt.result, reused: true}; }
    checkVersion(rule, body.version);
    if (!rule.enabled) fault(422, 'Регламент отключён.');
    const reading = latestReading(rule.asset_id);
    if (!reading || reading.id !== body.reading_id) fault(409, 'Показание изменилось. Проверь последнее значение.');
    if (!body.performed_on || body.performed_on < reading.reading_on || body.performed_on > today()) fault(422, 'Дата ТО должна быть от даты показания до сегодняшнего дня.');
    if (!String(body.works || '').trim()) fault(422, 'Опиши выполненные работы.');
    if (number(body.hours || 0).gt(24)) fault(422, 'Не больше 24 часов за день.');
    if (!body.idempotency_key || String(body.idempotency_key).length < 8) fault(422, 'Не указан идентификатор операции.');
    const parts: Row[] = body.materials || [], totals = new Map<number, Decimal>();
    for (const part of parts) { const qty = number(part.quantity); if (!qty.gt(0)) fault(422, 'Количество расходника должно быть больше нуля.'); totals.set(part.stock_id, (totals.get(part.stock_id) || new Decimal(0)).plus(qty)); }
    for (const [id, quantity] of totals) { const item = get('stock', id); if (item.archived || number(item.quantity).lt(quantity)) fault(422, 'Недостаточно расходников: ' + item.name); }
    const worklog = add('worklogs', {worked_on: body.performed_on, title: 'ТО: ' + rule.name, person_id: body.person_id || null, asset_id: rule.asset_id, field_id: null, project_id: null, hours: number(body.hours || 0).toString(), quantity: '1', unit: 'ТО', notes: body.works, review_status: 'approved'});
    const timesheet = body.person_id && number(body.hours || 0).gt(0) ? tabulate(worklog, {version: worklog.version}).timesheet : null;
    const movements = parts.map((part, index) => moveStock(get('stock', part.stock_id), {direction: 'out', quantity: part.quantity, occurred_on: body.performed_on, worklog_id: worklog.id, note: body.works, idempotency_key: body.idempotency_key + '-' + index}));
    const service = add('maintenance_services', {rule_id: rule.id, rule_version: rule.version, rule_name: rule.name, interval_hours: rule.interval_hours, asset_id: rule.asset_id, reading_id: reading.id, performed_on: body.performed_on, meter_value: reading.value, worklog_id: worklog.id, works: body.works, movement_ids: movements.map(row => row.id), idempotency_key: body.idempotency_key});
    const result = {service, worklog, timesheet, movements, reused: false}; state.receipts['maintenance:' + body.idempotency_key] = {signature, result: clone(result)}; return result;
  };
  const calculate = (kind: string, inputs: Row) => {
    if (kind === 'cost') {
      if (!Array.isArray(inputs.lines) || !inputs.lines.length) fault(422, 'Добавь хотя бы одну статью затрат.');
      const lines = inputs.lines.map((line: Row) => ({name: line.name, amount: money(number(line.quantity).times(number(line.unit_cost)))}));
      const total = sum(lines, 'amount'), quantity = number(inputs.output_quantity); if (!quantity.gt(0)) fault(422, 'Объём выпуска должен быть больше нуля.');
      const unit = total.div(quantity), markup = number(inputs.markup_percent || 0);
      return {result: {lines, total_cost: money(total), output_quantity: quantity.toString(), unit_cost: money(unit), markup_percent: markup.toString(), selling_price: money(unit.times(markup.div(100).plus(1)))}, source_snapshot: {}};
    }
    if (kind === 'payroll') {
      const gross = number(inputs.hours).times(number(inputs.rate)), tax = number(inputs.tax_percent || 0), contribution = number(inputs.contribution_percent || 0);
      if (tax.gt(100) || contribution.gt(100)) fault(422, 'Ставки должны быть от 0 до 100%.');
      const taxAmount = new Decimal(money(gross.times(tax).div(100))), contributions = new Decimal(money(gross.times(contribution).div(100)));
      return {result: {gross: money(gross), tax: money(taxAmount), net: money(gross.minus(taxAmount)), contributions: money(contributions), employer_cost: money(gross.plus(contributions)), notice: 'Учебный управленческий расчёт. Ставки задаются вручную.'}, source_snapshot: {}};
    }
    if (kind === 'roi') { const profit = number(inputs.monthly_revenue).minus(number(inputs.monthly_costs)); return {result: {investment: money(number(inputs.investment)), monthly_profit: money(profit), payback_months: profit.gt(0) ? number(inputs.investment).div(profit).toDecimalPlaces(2).toString() : null}, source_snapshot: {}}; }
    if (['payroll_period', 'operation_cost'].includes(kind)) {
      const start = inputs.start, end = inputs.end;
      if (!start || !end || start > end) fault(422, 'Проверь начало и конец периода.');
      const works = active('worklogs').filter(row => row.review_status === 'approved' && row.worked_on >= start && row.worked_on <= end && ['person_id', 'project_id', 'field_id', 'worklog_id'].every(key => !inputs[key] || row[key === 'worklog_id' ? 'id' : key] === Number(inputs[key])));
      const sheets = active('timesheets').filter(row => works.some(work => work.id === row.source_worklog_id && !isStale(row, work)));
      const sources = [...works.map(row => ({resource: 'worklogs', id: row.id, version: row.version})), ...sheets.map(row => ({resource: 'timesheets', id: row.id, version: row.version}))];
      const base = {start, end, total_hours: sum(sheets, 'hours').toString(), worklog_count: works.length, timesheet_count: sheets.length, missing_timesheets: works.filter(work => !sheets.some(sheet => sheet.source_worklog_id === work.id)).map(row => ({id: row.id, title: row.title})), is_complete: sheets.length === works.length};
      const labor = sum(sheets, 'amount');
      if (kind === 'payroll_period') {
        if (inputs.tax_percent === null || inputs.tax_percent === '' || inputs.tax_percent === undefined || inputs.contribution_percent === null || inputs.contribution_percent === '' || inputs.contribution_percent === undefined) fault(422, 'Укажи обе ставки расчёта, включая нулевые.');
        const tax = number(inputs.tax_percent), contribution = number(inputs.contribution_percent); if (tax.gt(100) || contribution.gt(100)) fault(422, 'Ставки должны быть от 0 до 100%.');
        const taxAmount = new Decimal(money(labor.times(tax).div(100))), contributions = new Decimal(money(labor.times(contribution).div(100)));
        return {result: {...base, gross: money(labor), tax: money(taxAmount), net: money(labor.minus(taxAmount)), contributions: money(contributions), employer_cost: money(labor.plus(contributions)), rows: sheets.map(row => ({timesheet_id: row.id, person_name: title(get('people', row.person_id)), work_date: row.work_date, hours: row.hours, rate: row.rate, amount: row.amount, source_stale: false}))}, source_snapshot: {records: sources}};
      }
      const movements = state.movements.filter(row => row.direction === 'out' && works.some(work => work.id === row.worklog_id));
      const materials = sum(movements, 'total_cost'), extra = sum((inputs.extra_lines || []).map((line: Row) => ({amount: number(line.amount).toString()})), 'amount'), total = labor.plus(materials).plus(extra), qty = number(inputs.output_quantity); if (!qty.gt(0)) fault(422, 'Объём выпуска должен быть больше нуля.');
      return {result: {...base, labor_cost: money(labor), materials_cost: money(materials), extra_cost: money(extra), total_cost: base.is_complete ? money(total) : null, known_cost: money(total), output_quantity: qty.toString(), output_unit: inputs.output_unit || '', unit_cost: base.is_complete ? money(total.div(qty)) : null, selling_price: base.is_complete ? money(total.div(qty).times(number(inputs.markup_percent || 0).div(100).plus(1))) : null}, source_snapshot: {records: [...sources, ...movements.map(row => ({resource: 'stock', id: row.stock_id, version: get('stock', row.stock_id).version}))]}};
    }
    return fault(422, 'Этот вид расчёта доступен в серверной версии.');
  };
  const createRecord = (resource: string, body: Row) => {
    const metadata = seed.meta.resources.find((item: Row) => item.key === resource) || fault(404, 'Список не найден.');
    if (resource === 'maintenance_services') fault(422, 'Заверши ТО через карточку регламента.');
    const allowed = new Set(metadata.fields.map((field: Row) => field.key));
    const data: Row = {};
    for (const field of metadata.fields) {
      if (field.default !== undefined) data[field.key] = clone(field.default);
      if (Object.hasOwn(body, field.key) && !field.readOnly) data[field.key] = body[field.key];
      if (field.required && !field.readOnly && (data[field.key] === undefined || data[field.key] === null || String(data[field.key]).trim() === '')) fault(422, 'Заполни поле: ' + field.label);
      const value = data[field.key];
      if (value != null && ['number', 'money'].includes(field.type)) data[field.key] = number(value).toString();
      if (value != null && field.type === 'checkbox' && typeof value !== 'boolean') fault(422, 'Проверь значение: ' + field.label);
      if (value != null && field.type === 'json' && (typeof value !== 'object' || (field.key === 'parts' ? !Array.isArray(value) : Array.isArray(value)))) fault(422, 'Проверь структуру данных: ' + field.label);
      if (value != null && ['text', 'textarea', 'date', 'datetime'].includes(field.type) && !field.readOnly && typeof value !== 'string') fault(422, 'Ожидается текст: ' + field.label);
      if (value && field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fault(422, 'Проверь дату: ' + field.label);
      if (value && field.type === 'datetime' && !Number.isFinite(Date.parse(value))) fault(422, 'Проверь дату и время: ' + field.label);
      if (value != null && field.reference) { if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) fault(422, 'Выбери запись: ' + field.label); const reference = get(field.reference, value); if (reference.archived) fault(422, 'Выбранная запись находится в архиве.'); data[field.key] = reference.id; }
      if (data[field.key] != null && field.options && !field.options.some((option: Row) => option.value === data[field.key])) fault(422, 'Выбери значение: ' + field.label);
    }
    for (const key of Object.keys(body)) if (!allowed.has(key) && key !== 'version') fault(422, 'Неизвестное поле: ' + key);
    if (fingerprint(data).length > 150000) fault(422, 'Запись слишком большая для публичной демки.');
    if (resource === 'tasks' && !data.scope) data.scope = 'team';
    if (resource === 'tasks' && data.recurrence && data.recurrence !== 'none' && !data.due_date) fault(422, 'Для повторяющейся задачи укажи дату.');
    if (resource === 'events' && data.ends_at && data.starts_at && Date.parse(data.ends_at) < Date.parse(data.starts_at)) fault(422, 'Окончание события должно быть после начала.');
    if (resource === 'worklogs') { data.review_status = 'draft'; if (number(data.hours || 0).gt(24)) fault(422, 'Не больше 24 часов за день.'); }
    if (resource === 'timesheets') { if (number(data.hours || 0).gt(24)) fault(422, 'Не больше 24 часов за день.'); data.amount = money(number(data.hours).times(number(data.rate))); }
    if (resource === 'meter_readings') {
      if (get('assets', data.asset_id).kind !== 'equipment') fault(422, 'Показания моточасов доступны для техники.');
      const previous = latestReading(data.asset_id);
      if (data.reading_on > today()) fault(422, 'Показание не может быть из будущего.');
      if (previous && (data.reading_on < previous.reading_on || number(data.value).lt(number(previous.value)))) fault(422, 'Дата и моточасы не могут быть меньше последнего показания.');
    }
    if (resource === 'maintenance_rules') { if (get('assets', data.asset_id).kind !== 'equipment') fault(422, 'Регламент ТО доступен для техники.'); if (!number(data.interval_hours).gt(0)) fault(422, 'Интервал должен быть больше нуля.'); if ((data.parts || []).length > 100) fault(422, 'Не больше 100 расходников в регламенте.'); for (const part of data.parts || []) { if (!part || typeof part !== 'object') fault(422, 'Проверь расходники.'); get('stock', part.stock_id); if (!number(part.quantity).gt(0)) fault(422, 'Количество расходника должно быть больше нуля.'); } }
    if (resource === 'calculations') { const calculated = calculate(data.kind, data.inputs || {}); Object.assign(data, calculated, {status: 'draft', approved_at: null}); }
    return data;
  };
  const calendar = (start = '', end = '9999') => {
    const items = active('tasks').filter(row => row.due_date && row.status !== 'completed' && row.status !== 'cancelled').map(row => ({id: 'tasks-' + row.id, title: row.title, start: row.due_date, kind: 'task', resource: 'tasks', record_id: row.id}));
    items.push(...active('events').map(row => ({id: 'events-' + row.id, title: row.title, start: row.starts_at, end: row.ends_at, kind: row.kind, resource: 'events', record_id: row.id})));
    return items.filter(row => row.start.slice(0, 10) >= start && row.start.slice(0, 10) <= end).sort((a, b) => a.start.localeCompare(b.start));
  };
  const forecast = (item: Row) => {
    const daily = number(item.daily_usage || 0), days = daily.gt(0) ? number(item.quantity).div(daily) : null, depletion = days ? plusDays(today(), Math.floor(days.toNumber())) : null;
    return {stock_id: item.id, quantity: item.quantity, lead_time_days: item.lead_time_days || 0, average_daily_usage: daily.gt(0) ? daily.toString() : null, days_left: days?.toDecimalPlaces(2).toString() ?? null, depletion_on: depletion, reorder_on: depletion ? plusDays(depletion, -(item.lead_time_days || 0)) : null, basis: daily.gt(0) ? 'manual' : 'insufficient', history_days: 30, history_start: plusDays(today(), -29), history_end: today(), history_out_quantity: '0', notice: 'Прогноз по заданному среднему расходу; фактическая потребность может отличаться.'};
  };
  const dispatch = (method: string, path: string, params: URLSearchParams, body: Row): unknown => {
    if (path === '/auth/config') return {demo: true};
    if (path === '/auth/login' && method === 'POST') { state.session = clone(seed.session); return state.session; }
    if (path === '/auth/logout' && method === 'POST') { state.session = null; return {ok: true}; }
    if (path === '/auth/session') return state.session || fault(401, 'Открой учебную демку заново.');
    if (!state.session) fault(401, 'Войди в демо.');
    if (path === '/startup') return {session: state.session, bootstrap: bootstrap(), meta: {...seed.meta, capabilities}, preferences: state.preferences, navigation: state.navigation};
    if (path === '/bootstrap') return bootstrap();
    if (path === '/meta') return {...seed.meta, capabilities};
    if (path === '/workspace') { if (method === 'PATCH') { checkVersion(state.workspace, body.version); if (Object.keys(body).some(key => !['version', 'name', 'activity', 'departments', 'time_zone', 'currency', 'default_tax_percent', 'default_contribution_percent'].includes(key))) fault(422, 'Неизвестный параметр хозяйства.'); update(state.workspace, body); } return state.workspace; }
    if (path === '/preferences') { if (method === 'PATCH') Object.assign(state.preferences, body); return state.preferences; }
    if (path === '/navigation') {
      if (method === 'PATCH') {
        const nav = state.navigation, pageName = String(body.page || 'today');
        if (body.action === 'visit') { nav.opened = [...nav.opened.filter((item: string) => item !== pageName), pageName].slice(-6); nav.active = pageName; if (body.section) nav.sections[pageName] = body.section; }
        else if (body.action === 'close') { nav.opened = nav.opened.filter((item: string) => item !== pageName); if (nav.active === pageName) nav.active = nav.opened.at(-1) || 'today'; }
        else if (body.action === 'favorite') nav.favorites = [...new Set([...nav.favorites, pageName])];
        else if (body.action === 'unfavorite') nav.favorites = nav.favorites.filter((item: string) => item !== pageName);
        else fault(422, 'Неизвестное действие навигации.'); nav.version++;
      } return state.navigation;
    }
    if (path === '/auth/profile' && method === 'GET') return {user: state.session!.user, permissions: state.session!.permissions};
    if (path === '/accounts' && method === 'GET') return {...page([{...state.session!.user, permissions: state.session!.permissions, has_recovery_code: false}], params), resources: seed.meta.resources.map((resource: Row) => ({key: resource.key, label: resource.label}))};
    if (path.startsWith('/auth/') || path.startsWith('/accounts')) fault(422, 'Учётные записи и восстановление доступны в серверной версии. Не вводи реальные пароли в публичную демку.');
    if (path === '/integrations' && method === 'GET') return {...clone(seed.integrations), connections: [], batches: [], notice};
    if (path === '/notifications' && method === 'GET') return {...clone(seed.notifications), notice};
    const notificationPreview = path.match(/^\/notifications\/(telegram|max)\/preview$/);
    if (notificationPreview && method === 'POST') {
      const channel = seed.notifications.channels.find((item: Row) => item.provider === notificationPreview[1]);
      const event = seed.notifications.events.find((item: Row) => item.key === body.event), values = body.values ?? {};
      if (!event || Object.keys(body).some(key => !['event', 'values'].includes(key))) fault(422, 'Выбери событие для предпросмотра.');
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.entries(values).some(([key, value]) => !['title', 'date', 'details'].includes(key) || typeof value !== 'string' || value.length > 4000)) fault(422, 'Для предпросмотра доступны текстовые title, date, details.');
      const text = channel.templates[body.event].replace(/\{(title|date|details)\}/g, (_match: string, key: string) => values[key] ?? '').trim();
      if (!text || text.length > 4000) fault(422, 'Сообщение должно содержать от 1 до 4000 символов.');
      const payload = channel.provider === 'telegram'
        ? {method: 'POST', url: 'https://api.telegram.org/bot[masked]/sendMessage', headers: {'Content-Type': 'application/json'}, body: {chat_id: channel.recipient_id, text, link_preview_options: {is_disabled: true}}}
        : {method: 'POST', url: 'https://platform-api2.max.ru/messages?' + new URLSearchParams({[channel.recipient_type === 'user' ? 'user_id' : 'chat_id']: channel.recipient_id}), headers: {Authorization: '[masked]', 'Content-Type': 'application/json'}, body: {text, notify: true}};
      return {provider: channel.provider, event: body.event, recipient: {type: channel.recipient_type, id: channel.recipient_id}, text, payload, status: 'preview', outbound_enabled: false, notice};
    }
    if (path === '/speech/jobs' && method === 'GET') return {items: []};
    if (path.startsWith('/speech') || path.startsWith('/integrations/') || path.startsWith('/notifications/')) fault(422, 'Подключения, распознавание голоса и отправка доступны в серверной версии. Публичная демка не хранит токены.');
    if (path === '/local-references') return {images: [{id: 'fields', title: 'Вымышленная схема полей', image_url: './demo-fields.svg'}]};
    if (path === '/field-map') return {fields: active('assets').filter(row => row.kind === 'field'), reference_id: 'fields', notice: 'Условная схема, без привязки к реальным земельным участкам.'};
    if (path === '/field-map/assign' && method === 'POST') { const row = get('assets', body.asset_id); checkVersion(row, body.version); if (row.kind !== 'field') fault(422, 'Выбери поле.'); if (body.clear) return update(row, {details: {...row.details, map_pin: null}}); const x = number(body.x), y = number(body.y); if (x.gt(1) || y.gt(1)) fault(422, 'Выбери точку внутри схемы.'); return update(row, {details: {...row.details, map_pin: {reference_id: 'fields', x: x.toNumber(), y: y.toNumber()}}}); }
    if (path === '/demo/pilot' && method === 'POST') return {created: false};
    if (path.startsWith('/demo/') || path.startsWith('/backup') || path.startsWith('/restore')) fault(422, 'Операция доступна в серверной версии. Для сброса учебных данных используй кнопку в шапке.');
    if (path === '/drafts' && method === 'GET') return {items: Object.values(state.drafts).filter(row => row.status === 'active'), generation: state.generation};
    const draftMatch = path.match(/^\/drafts\/([^/]+)$/);
    if (draftMatch) {
      const key = decodeURIComponent(draftMatch[1]), old = state.drafts[key];
      if (method === 'GET') return old ? {...old, generation: state.generation} : fault(404, 'Черновик не найден.');
      if (method === 'PUT') {
        if (body.generation !== undefined && body.generation !== state.generation) fault(409, 'Демка была сброшена. Открой форму заново.');
        if ((old?.version || 0) !== body.expected_version) fault(409, 'Черновик изменился в другом окне.');
        if (old && old.status !== 'active') fault(409, 'Черновик уже закрыт. Создай новый.');
        const binding: Row = {assistant: 'tasks', movement: 'stock', maintenance: 'maintenance_rules', timesheet: 'worklogs', workspace: 'workspace', document: 'documents', calculation: 'calculations'};
        if (body.kind !== 'record' && binding[body.kind] !== body.resource || body.kind === 'record' && !state.records[body.resource]) fault(422, 'Неверный тип черновика.');
        if (fingerprint(body).length > 150000) fault(422, 'Черновик слишком большой.');
        return state.drafts[key] = {key, version: (old?.version || 0) + 1, kind: body.kind, resource: body.resource, record_id: body.record_id ?? null, base_version: body.base_version ?? null, title: String(body.title || '').slice(0, 300), data: clone(body.data || {}), context: clone(body.context || {}), status: 'active', updated_at: now().toISOString(), generation: state.generation};
      }
      if (method === 'DELETE') {
        const expected = Number(params.get('expected_version'));
        if (!old && expected === 0) return state.drafts[key] = {key, version: 1, resource: '', status: 'discarded', data: {}, context: {}, updated_at: now().toISOString(), generation: state.generation};
        if (old?.status === 'discarded' && old.resource === '' && expected === 0) return old;
        if (!old) fault(404, 'Черновик не найден.'); checkVersion(old, expected); return update(old, {status: 'discarded', data: {}, context: {}, title: ''});
      }
    }
    if (path === '/assistant/interpret' && method === 'POST') {
      const text = String(body.text || '').trim(); if (!text) fault(422, 'Напиши задачу.');
      const tomorrow = /завтра/i.test(text), due = tomorrow ? plusDays(today(), 1) : /сегодня/i.test(text) ? today() : null;
      return {draft: {title: text.replace(/^(?:поставь|создай|добавь|назначь|напомни)(?:\s+мне)?(?:\s+задачу)?\s*/i, '').slice(0, 300), scope: body.scope === 'personal' ? 'personal' : 'team', priority: /срочн|важн/i.test(text) ? 'high' : 'normal', status: 'planned', recurrence: 'none', due_date: due}, notice: 'Учебный разбор по словам сегодня, завтра и срочно. Проверь поля перед сохранением.'};
    }
    const taskAction = path.match(/^\/tasks\/(\d+)\/(complete|draft-message)$/);
    if (taskAction && method === 'POST') {
      const task = get('tasks', taskAction[1]);
      if (task.archived) fault(409, 'Задача находится в архиве.');
      if (taskAction[2] === 'draft-message') {
        if (!task.assignee_id) fault(422, 'Сначала назначь исполнителя.');
        const existing = active('messages').find(row => row.task_id === task.id && row.status === 'draft' && row.source_task_version === task.version);
        return existing || add('messages', {task_id: task.id, recipient_id: task.assignee_id, text: title(get('people', task.assignee_id)) + ', напоминание: ' + task.title + '. Срок: ' + (task.due_date || 'без срока') + '. Сообщи результат после выполнения.', status: 'draft', approved_at: null, source_task_version: task.version});
      }
      if (task.status === 'completed') return task;
      checkVersion(task, body.version);
      update(task, {status: 'completed', completed_at: now().toISOString()});
      if (task.recurrence && task.recurrence !== 'none' && !active('tasks').some(row => row.parent_task_id === task.id)) {
        let due = task.due_date || today();
        if (task.recurrence === 'daily' || task.recurrence === 'weekly') due = plusDays(due, task.recurrence === 'daily' ? 1 : 7);
        else {
          const date = new Date(due + 'T12:00:00Z'), originalDay = date.getUTCDate(); date.setUTCDate(1);
          date.setUTCMonth(date.getUTCMonth() + (task.recurrence === 'monthly' ? 1 : 12));
          const maximum = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(originalDay, maximum)); due = date.toISOString().slice(0, 10);
        }
        const child = add('tasks', {...Object.fromEntries(seed.meta.resources.find((resource: Row) => resource.key === 'tasks').fields.map((field: Row) => [field.key, clone(task[field.key])])), status: 'planned', completed_at: null, parent_task_id: task.id, due_date: due, remind_at: task.remind_at ? due + task.remind_at.slice(10) : null});
        return {...task, next_task_id: child.id};
      }
      return task;
    }
    const messageApproval = path.match(/^\/messages\/(\d+)\/approve$/);
    if (messageApproval && method === 'POST') {
      const message = get('messages', messageApproval[1]); checkVersion(message, body.version);
      if (message.task_id && get('tasks', message.task_id).version !== message.source_task_version) fault(409, 'Поручение изменилось. Подготовь сообщение заново.');
      return update(message, {status: 'approved', approved_at: now().toISOString()});
    }
    if (path === '/personal/summary') {
      const counts = {overdue: 0, today: 0, upcoming: 0, unscheduled: 0};
      const reminders = active('tasks').filter(row => row.scope === 'personal' && !['completed', 'cancelled'].includes(row.status)).map(task => { const status = !task.due_date ? 'unscheduled' : task.due_date < today() ? 'overdue' : task.due_date === today() ? 'today' : 'upcoming'; counts[status]++; return {task, state: status}; });
      return {as_of: today(), counts, reminders, reminder_total: reminders.length, notice};
    }
    if (path === '/journal') {
      const day = params.get('day') || today(), rows = active('worklogs').filter(row => row.worked_on === day), approved = rows.filter(row => row.review_status === 'approved');
      const enriched = rows.map(row => ({...row, materials_cost: workflow(row).materials_cost})), result = page(enriched, params), units: Row = {};
      for (const row of approved) units[row.unit || 'ед.'] = new Decimal(units[row.unit || 'ед.'] || 0).plus(row.quantity || 0).toString();
      return {day, rows: result.items, ...result, totals: {approved_count: approved.length, draft_count: rows.length - approved.length, hours: sum(approved, 'hours').toString(), quantity_by_unit: units, materials_cost: money(approved.reduce<Decimal>((total, row) => total.plus(workflow(row).materials_cost), new Decimal(0))), labor_cost: money(approved.reduce<Decimal>((total, row) => total.plus(workflow(row).labor_cost || 0), new Decimal(0)))}, notice};
    }
    if (path === '/maintenance/overview') return {equipment: active('assets').filter(row => row.kind === 'equipment').map(equipment), notice};
    const equipmentMatch = path.match(/^\/maintenance\/assets\/(\d+)$/); if (equipmentMatch) return {...equipment(get('assets', equipmentMatch[1])), notice};
    const completeMatch = path.match(/^\/maintenance\/rules\/(\d+)\/complete$/); if (completeMatch && method === 'POST') return completeMaintenance(get('maintenance_rules', completeMatch[1]), body);
    const workMatch = path.match(/^\/worklogs\/(\d+)\/(workflow|approve|reopen|timesheet)$/);
    if (workMatch) {
      const work = get('worklogs', workMatch[1]), action = workMatch[2];
      if (action === 'workflow' && method === 'GET') return workflow(work);
      if (method === 'POST' && action === 'timesheet') return tabulate(work, body);
      if (method === 'POST') { checkVersion(work, body.version); return update(work, {review_status: action === 'approve' ? 'approved' : 'draft'}); }
    }
    const stockMatch = path.match(/^\/stock\/(\d+)\/(movements|forecast)$/);
    if (stockMatch) { const stock = get('stock', stockMatch[1]); if (stockMatch[2] === 'forecast') return forecast(stock); if (method === 'GET') return {items: state.movements.filter(row => row.stock_id === stock.id).sort((a, b) => b.id - a.id)}; if (method === 'POST') return moveStock(stock, body); }
    if (path === '/calculations/preview' && method === 'POST') return {inputs: body.inputs, ...calculate(body.kind, body.inputs || {})};
    const approval = path.match(/^\/calculations\/(\d+)\/(approve|reopen)$/);
    if (approval && method === 'POST') { const row = get('calculations', approval[1]); checkVersion(row, body.version); if (approval[2] === 'approve') { if (['payroll_period', 'operation_cost'].includes(row.kind) && fingerprint(calculate(row.kind, row.inputs).source_snapshot) !== fingerprint(row.source_snapshot)) fault(409, 'Исходные данные изменились. Пересчитай черновик перед согласованием.'); for (const source of row.source_snapshot?.records || []) checkVersion(get(source.resource, source.id), source.version); if (row.result?.is_complete === false) fault(422, 'Сначала исправь неполные исходные данные.'); } return update(row, {status: approval[2] === 'approve' ? 'approved' : 'draft', approved_at: approval[2] === 'approve' ? now().toISOString() : null}); }
    if (path === '/calendar') return {items: calendar(params.get('start') || '', params.get('end') || '9999')};
    if (path === '/dashboard') {
      const tasks = active('tasks').filter(row => !['completed', 'cancelled'].includes(row.status)), low = active('stock').filter(row => number(row.quantity).lt(number(row.min_quantity || 0))), pending = active('messages').filter(row => row.status === 'draft');
      const reorder = active('stock').map(row => ({...row, forecast: forecast(row)})).filter(row => row.forecast.reorder_on && row.forecast.reorder_on <= today());
      return {tasks: tasks.sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))), pending_messages: pending, low_stock: low, stock_reorder: reorder, upcoming: calendar(today()), summary: {overdue_tasks: tasks.filter(row => row.due_date && row.due_date < today()).length, pending_messages: pending.length, low_stock: low.length, reorder_due: reorder.length}};
    }
    if (path === '/insights') {
      const days = Math.min(90, Math.max(1, Number(params.get('days')) || 14)), dates = Array.from({length: days}, (_, index) => plusDays(today(), index - days + 1)), works = active('worklogs').filter(row => row.review_status === 'approved' && row.worked_on >= dates[0] && row.worked_on <= today()), tasks = active('tasks'), maintenance: Row = {unknown: 0, okay: 0, due: 0, overdue: 0, disabled: 0};
      for (const row of active('maintenance_rules')) maintenance[maintenanceRule(row).state]++;
      return {start: dates[0], end: today(), units: {work_hours: 'ч'}, work_hours: dates.map(date => { const rows = works.filter(row => row.worked_on === date); return {date, hours: sum(rows, 'hours').toString(), count: rows.length}; }), task_completion: dates.map(date => ({date, completed: tasks.filter(row => row.status === 'completed' && row.updated_at.slice(0, 10) === date).length, open: tasks.filter(row => !['completed', 'cancelled'].includes(row.status)).length})), maintenance, totals: {approved_worklogs: works.length, work_hours: sum(works, 'hours').toString(), completed_tasks: tasks.filter(row => row.status === 'completed').length, open_tasks: tasks.filter(row => !['completed', 'cancelled'].includes(row.status)).length}, notice: 'Только подтверждённые работы; состояния ТО вычисляются по последним показаниям. ' + notice};
    }
    if (path === '/reports/summary') {
      const start = params.get('start') || today().slice(0, 8) + '01', end = params.get('end') || today(); if (start > end) fault(422, 'Проверь период.');
      const works = active('worklogs').filter(row => row.review_status === 'approved' && row.worked_on >= start && row.worked_on <= end), sheets = active('timesheets').filter(row => row.work_date >= start && row.work_date <= end);
      return {start, end, tasks: {total: active('tasks').length, completed: active('tasks').filter(row => row.status === 'completed').length}, worklogs: {count: works.length, hours: sum(works, 'hours').toString()}, timesheets: {count: sheets.length, hours: sum(sheets, 'hours').toString(), amount: money(sum(sheets, 'amount'))}, stock: {items: active('stock').length, value: money(active('stock').reduce<Decimal>((total, row) => total.plus(number(row.quantity).times(number(row.unit_cost || 0))), new Decimal(0)))}, calculations: {count: active('calculations').length}, notice};
    }
    if (path === '/search' || path === '/knowledge/search') {
      const query = safeText(params.get('q') || '').trim();
      const items = Object.entries(state.records).flatMap(([resource, rows]) => rows.filter(row => !row.archived).map(row => ({row, resource}))).filter(({row}) => query && safeText(JSON.stringify(row)).includes(query)).map(({row, resource}) => ({resource, id: row.id, record_id: row.id, title: title(row), snippet: String(row.notes || row.body || row.text || row.operation || row.name || '').slice(0, 220), matched_fields: Object.keys(row).filter(key => typeof row[key] === 'string' && safeText(row[key]).includes(query)), route: resource, version: row.version}));
      return {query: params.get('q') || '', ...page(items, params)};
    }
    if (path === '/activity') return {items: state.activity.filter(row => (!params.get('resource') || row.resource === params.get('resource')) && (!params.get('record_id') || row.record_id === Number(params.get('record_id')))).slice(-100).reverse()};
    const resourceMatch = path.match(/^\/([a-z_]+)(?:\/(\d+))?(?:\/(archive|restore))?$/);
    if (resourceMatch && state.records[resourceMatch[1]]) {
      const [, resource, id, action] = resourceMatch;
      if (method === 'GET') return id ? get(resource, id) : page(filterRows(resource, params), params);
      if (method === 'POST' && !id) return add(resource, createRecord(resource, body));
      if (id) {
        const old = get(resource, id); checkVersion(old, body.version);
        if (method === 'POST' && action) { if (['meter_readings', 'maintenance_services'].includes(resource)) fault(422, 'История моточасов и выполненных ТО неизменяема.'); return update(old, {archived: action === 'archive'}); }
        if (method === 'PATCH' && !action) {
          if (['meter_readings', 'maintenance_services'].includes(resource)) fault(422, 'История моточасов и выполненных ТО неизменяема.');
          if (resource === 'worklogs' && old.review_status === 'approved') fault(422, 'Сначала верни работу на проверку.');
          if (resource === 'timesheets' && old.source_worklog_id) fault(422, 'Обнови связанный табель через исходную работу.');
          if (resource === 'calculations' && old.status === 'approved') fault(422, 'Сначала верни расчёт на проверку.');
          if (resource === 'stock' && body.quantity !== undefined && String(body.quantity) !== String(old.quantity)) fault(422, 'Изменяй остаток через приход и расход.');
          const writable = Object.fromEntries(seed.meta.resources.find((item: Row) => item.key === resource).fields.filter((field: Row) => !field.readOnly).map((field: Row) => [field.key, old[field.key]]));
          return update(old, createRecord(resource, {...writable, ...body}));
        }
      }
    }
    return fault(422, 'Это действие доступно в серверной версии Smart Assistant. В публичной демке данные остаются в браузере.');
  };

  async function request(rawPath: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(rawPath, 'https://pages-demo.invalid'), path = url.pathname.replace(/^\/api/, ''), method = (init.method || 'GET').toUpperCase();
    try {
      load();
      if (method === 'GET' && path === '/exports/report.xlsx') return new Response(Uint8Array.from(atob(seed.reportXlsxBase64), char => char.charCodeAt(0)), {headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Demo-example.xlsx"'}});
      const csv = path.match(/^\/exports\/([a-z_]+)\.csv$/);
      if (method === 'GET' && csv && state.records[csv[1]]) {
        const rows = active(csv[1]), fields = seed.meta.resources.find((resource: Row) => resource.key === csv[1]).fields;
        const cell = (value: unknown) => { let text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); if (/^[\s]*[=+@\-\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
        const text = '\uFEFF' + [fields.map((field: Row) => cell(field.label)).join(';'), ...rows.map(row => fields.map((field: Row) => cell(row[field.key])).join(';'))].join('\r\n');
        return new Response(text, {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Demo-' + csv[1] + '.csv"'}});
      }
      if (init.body && typeof init.body !== 'string') fault(422, 'Загрузка файлов доступна в серверной версии.');
      let body: Row = {}; try { body = init.body ? JSON.parse(String(init.body)) : {}; } catch { fault(422, 'Не удалось прочитать данные формы.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') fault(422, 'Проверь данные формы.');
      const backup = clone(state), headers = new Headers(init.headers), key = headers.get('X-Draft-Key'), draft = key ? state.drafts[key] : null;
      const signature = fingerprint({method, path, body});
      try {
        if (key && method !== 'GET') {
          const receipt = state.receipts['draft:' + key];
          if (receipt) { if (receipt.signature !== signature) fault(409, 'Черновик уже использован для другого действия.'); return json(receipt.result, receipt.status); }
          if (!draft || draft.status !== 'active' || draft.version !== Number(headers.get('X-Draft-Version'))) fault(409, 'Черновик уже изменён или закрыт.');
          const target = path.split('/')[1], expected = draft!.kind === 'maintenance' ? 'maintenance' : draft!.kind === 'timesheet' ? 'worklogs' : draft!.kind === 'assistant' ? 'assistant' : draft!.resource;
          if (target !== expected && !(target === 'field-map' && expected === 'assets')) fault(422, 'Черновик относится к другой форме.');
          const targetId = target === 'field-map' ? Number(body.asset_id) : target === 'maintenance' ? Number(path.split('/')[3]) : Number(path.split('/')[2]);
          if (draft!.record_id !== null && targetId !== draft!.record_id) fault(422, 'Черновик относится к другой записи.');
          if (draft!.base_version !== null && body.version !== undefined && body.version !== draft!.base_version) fault(409, 'Исходная запись черновика изменилась.');
        }
        const result = dispatch(method, path, url.searchParams, body), status = method === 'POST' && /^\/[a-z_]+$/.test(path) && state.records[path.slice(1)] ? 201 : 200;
        if (method !== 'GET' && !/^\/notifications\/(telegram|max)\/preview$/.test(path)) {
          if (draft && key) { update(draft, {status: 'committed', data: {}, context: {}, title: ''}); state.receipts['draft:' + key] = {signature, result: clone(result), status}; }
          if (!path.startsWith('/drafts') && !['/navigation', '/preferences'].includes(path)) { const row = result as Row; state.activity.push({id: ++state.sequence, resource: path.split('/')[1], record_id: row?.id || 0, action: method, created_at: now().toISOString(), actor: 'Демо-директор', changes: {note: 'Локальное действие в учебной демке'}}); state.activity = state.activity.slice(-200); }
          try { storage.setItem('state', JSON.stringify(state)); } catch { fault(507, 'Память браузера заполнена или недоступна. Изменения не сохранены. Освободи место или скачай данные.'); }
        }
        return json(result, status);
      } catch (error) { state = backup; throw error; }
    } catch (error) { const detail = error as Error & {status?: number}; return json({detail: detail.message || 'Ошибка локальной демки.'}, detail.status || 500); }
  }
  return {request, reset() { storage.clear(); state = initialState(today()); }, storage};
}

let installed: ReturnType<typeof createPagesDemo> | undefined;
export async function installPagesDemo(): Promise<void> {
  if (installed) return;
  installed = createPagesDemo(pagesDemoStorage());
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return original(input, init);
    if (init?.signal?.aborted || input instanceof Request && input.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const requestInit = input instanceof Request ? {method: input.method, headers: input.headers, ...(input.method === 'GET' || input.method === 'HEAD' ? {} : {body: await input.clone().text()}), ...init} : init;
    return installed!.request(url.pathname + url.search, requestInit);
  };
}
export function resetPagesDemo(): void {
  if (installed) installed.reset();
  else pagesDemoStorage().clear();
  location.reload();
}
