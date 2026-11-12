import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, FileText, Mic, Plus, Search, Send, Sparkles } from 'lucide-react';
import { api, dateText, numberText, overlapsMoscowDay, post, readableError, recordTitle, refresh, today } from './api';
import { Button, Empty, ErrorBox, HelpHint, Loading, PageHead, Panel, RecordRows, useApp } from './ui';
import type { CalendarItem, RecordData } from './types';
import type { SpeechInputProps } from './SpeechInput';
import { DeferredSpeechInput } from './SpeechLoader';
import { DraftStatus, useDurableDraft } from './Drafts';
import { canWrite } from './permissions';

export function SpeechInput(props:SpeechInputProps){return <DeferredSpeechInput {...props}/>;}

type DashboardData={tasks:RecordData[];pending_messages:RecordData[];low_stock:RecordData[];stock_reorder?:(RecordData&{forecast:{basis:string;reorder_on:string;depletion_on:string;average_daily_usage:string}})[];upcoming:CalendarItem[];summary:{overdue_tasks:number;pending_messages:number;low_stock:number;reorder_due?:number}};
type Insights={start:string;end:string;work_hours:{date:string;hours:string;count:number}[];task_completion:{date:string;completed:number;open:number}[];maintenance:Record<'unknown'|'okay'|'due'|'overdue'|'disabled',number>;totals:{approved_worklogs:number;work_hours:string;completed_tasks:number;open_tasks:number};notice:string};
export function Dashboard(){
 const {open,navigate,session}=useApp();
 const query=useQuery({queryKey:['dashboard',session.user.id,session.user.version],queryFn:()=>api<DashboardData>('/dashboard'),refetchInterval:60000});
 const insights=useQuery({queryKey:['insights',session.user.id,session.user.version,14],queryFn:()=>api<Insights>('/insights?days=14'),refetchInterval:60000});
 const board=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=board.current;if(!element)return;
  const layout=()=>{
   const style=getComputedStyle(element),unit=parseFloat(style.gridAutoRows),gap=parseFloat(style.rowGap);
   // Read all heights before changing spans so the grid only lays out once.
   const cards=Array.from(element.children) as HTMLElement[];
   const scale=parseFloat(getComputedStyle(element.closest('.app-shell')||element).getPropertyValue('zoom'))||1;
   const spans=cards.map(card=>Number.isFinite(unit)?'span '+Math.ceil((card.getBoundingClientRect().height/scale+gap)/(unit+gap)):'');
   for(const [index,card] of cards.entries()){
    const span=spans[index];
    if(card.style.gridRowEnd!==span)card.style.gridRowEnd=span;
   }
  };
  let frame=0;const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;layout();});};
  const observer=new ResizeObserver(schedule);observer.observe(element);for(const card of Array.from(element.children))observer.observe(card);layout();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();};
 },[query.data,insights.data,insights.error]);
 if(query.isLoading)return <Loading/>;
 if(query.error)return <ErrorBox message={readableError(query.error)} retry={()=>void query.refetch()}/>;
 const data=query.data!;const reorder=data.stock_reorder||[];const stocks=[...reorder,...data.low_stock.filter(stock=>!reorder.some(item=>item.id===stock.id))];
 const signals:[string,number,string][]=[['Просрочено',data.summary.overdue_tasks,'tasks'],['Ниже минимума',data.summary.low_stock,'stock'],['Пора заказать',data.summary.reorder_due||0,'stock'],['На согласовании',data.summary.pending_messages,'messages']];
 return <div className="dashboard-page"><PageHead title="Сегодня" actions={<><Button onClick={()=>open({resource:'worklogs',mode:'new',draft:{worked_on:today(),review_status:'draft'}})}>Записать работу</Button><Button variant="primary" onClick={()=>open({resource:'tasks',mode:'new',draft:{scope:'personal',status:'planned',priority:'normal',recurrence:'none'}})}><Plus size={17}/>Новая задача</Button></>}/><p className="dashboard-date">{new Intl.DateTimeFormat('ru-RU',{dateStyle:'full',timeZone:'Europe/Moscow'}).format(new Date())}</p>
 <nav className="attention-summary" aria-label="Требует внимания">{signals.map(([label,count,page])=><Button key={label} className={count?'attention-needed':''} onClick={()=>navigate(page)}><span>{label}</span><strong>{numberText(count)}</strong></Button>)}</nav>
 <div className="dashboard-board" ref={board}>{insights.isLoading?<Loading/>:insights.error?<ErrorBox message={readableError(insights.error)} retry={()=>void insights.refetch()}/>:insights.data?<><Panel className="dashboard-hours" title="Подтверждённые часы" action={<HelpHint label="Как считается сводка">{insights.data.notice}</HelpHint>}><div className="insight-total"><strong>{numberText(insights.data.totals.work_hours)} ч</strong><span>За 14 дней · {insights.data.totals.approved_worklogs} утверждённых работ</span></div><WorkHoursPlot points={insights.data.work_hours}/><div className="chart-range"><span>{dateText(insights.data.start)}</span><span>{dateText(insights.data.end)}</span></div><dl className="insight-counters"><div><dt>Завершено за 14 дней</dt><dd>{insights.data.totals.completed_tasks}</dd></div><div><dt>Открыто сейчас</dt><dd>{insights.data.totals.open_tasks}</dd></div></dl></Panel><Panel className="dashboard-maintenance" title="Регламенты ТО" action={<Button variant="text" onClick={()=>navigate('maintenance')}>Открыть</Button>}><MaintenancePlot values={insights.data.maintenance}/></Panel></>:null}
 <Panel className="dashboard-tasks" title="Ближайшие поручения" action={<Button variant="text" onClick={()=>navigate('tasks')}>{insights.data?'Все · '+insights.data.totals.open_tasks:'Все поручения'}</Button>}>{data.tasks.length?<RecordRows resource="tasks" items={data.tasks.slice(0,4)}/>:<Empty>Срочных поручений нет.</Empty>}</Panel>
 <Panel className="dashboard-calendar" title="Календарь" action={<Button variant="text" onClick={()=>navigate('calendar')}>Все события</Button>}>{data.upcoming.length?<div className="calendar-agenda">{data.upcoming.slice(0,4).map((event,index)=><div key={event.id||index}><CalendarDays size={16} aria-hidden/><span><strong>{event.title}</strong><small>{dateText(event.start)}{event.end&&event.end!==event.start?' - '+dateText(event.end):''}</small></span></div>)}</div>:<Empty>Ближайших событий нет.</Empty>}</Panel>
 <Panel className="dashboard-messages" title="На согласовании" action={<Button variant="text" onClick={()=>navigate('messages')}>Все · {data.summary.pending_messages}</Button>}>{data.pending_messages.length?<RecordRows resource="messages" items={data.pending_messages.slice(0,2)}/>:<Empty>Все подготовленные сообщения рассмотрены.</Empty>}</Panel>
 <Panel className="dashboard-stock" title="Запасы" action={<Button variant="text" onClick={()=>navigate('stock')}>Все запасы</Button>}>{stocks.length?<div className="simple-list">{stocks.slice(0,3).map(stock=>{const forecast=reorder.find(item=>item.id===stock.id)?.forecast;return <button className="simple-record" key={stock.id} onClick={()=>open({resource:'stock',record:stock,mode:'view'})}><span><strong>{recordTitle(stock)}</strong><small>Остаток {numberText(stock.quantity)} {String(stock.unit||'')} · минимум {numberText(stock.min_quantity)}</small>{forecast?<><small className="forecast-warning">Пора заказать · запас ориентировочно до {dateText(forecast.depletion_on)}</small><small>При прежнем расходе {numberText(forecast.average_daily_usage)} {String(stock.unit||'')}/день. {forecast.basis==='manual'?'По заданному расходу.':'По расходам за последние 30 дней.'}</small></>:null}</span><ArrowRight size={17} aria-hidden/></button>;})}</div>:<Empty>Нет запасов ниже минимума и срочных заказов по прогнозу.</Empty>}</Panel></div></div>;
}
function WorkHoursPlot({points}:{points:Insights['work_hours']}){
 const gradient='hours-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');const values=points.map(point=>Number(point.hours));
 if(!points.length)return <Empty>За этот период нет данных.</Empty>;
 if(values.some(value=>!Number.isFinite(value)))return <ErrorBox message="Не удалось прочитать значения графика."/>;
 const maximum=Math.max(...values,0);const coordinates=values.map((value,index)=>[12+index/Math.max(1,values.length-1)*536,164-(maximum?value/maximum*140:0)]);const line=coordinates.map(point=>point.join(',')).join(' ');const first=coordinates[0][0];const last=coordinates[coordinates.length-1][0];
 return <svg className="work-hours-chart" viewBox="0 0 560 184" preserveAspectRatio="none" role="img" aria-label="Подтверждённые часы по дням"><desc>{points.map(point=>dateText(point.date)+': '+numberText(point.hours)+' ч').join('; ')}</desc><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".24"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{[24,94,164].map(y=><line key={y} x1="12" x2="548" y1={y} y2={y} className="chart-gridline"/>)}<polygon points={first+',164 '+line+' '+last+',164'} fill={'url(#'+gradient+')'}/><polyline points={line} className="chart-line"/>{coordinates.map(([x,y],index)=><circle key={points[index].date} cx={x} cy={y} r="3" className="chart-point"><title>{dateText(points[index].date)}: {numberText(points[index].hours)} ч</title></circle>)}</svg>;
}
function MaintenancePlot({values}:{values:Insights['maintenance']}){
 const states:[keyof Insights['maintenance'],string,string][]=[['okay','По плану','var(--accent)'],['due','Пора готовить ТО','var(--warning)'],['overdue','Срок пройден','var(--danger)'],['unknown','Нет показаний','var(--violet)'],['disabled','Отключено','var(--muted)']];const total=states.reduce((sum,[key])=>sum+values[key],0);const circumference=2*Math.PI*54;let consumed=0;
 return <><div className="maintenance-plot"><div className="maintenance-ring"><svg viewBox="0 0 140 140" aria-hidden><circle className="chart-ring-ground" cx="70" cy="70" r="54"/>{states.map(([key,,color])=>{const length=total?values[key]/total*circumference:0;const offset=-consumed;consumed+=length;return length?<circle key={key} className="chart-ring-segment" cx="70" cy="70" r="54" stroke={color} strokeDasharray={length+' '+circumference} strokeDashoffset={offset}/>:null;})}</svg><div className="ring-total"><strong>{total}</strong><span>регламентов</span></div></div><ul className="chart-legend">{states.map(([key,label,color])=><li key={key}><span className="chart-key" style={{background:color}} aria-hidden/><span>{label}</span><strong>{values[key]}</strong></li>)}</ul></div>{!total?<p className="subtle">Регламенты ещё не добавлены. Настрой их по руководству техники.</p>:<p className="chart-note">Текущее состояние регламентов. У одной машины может быть несколько видов ТО.</p>}</>;
}

export function Assistant(){const {open,bootstrap,notify,session}=useApp();const [text,setText]=useState('');const durable=useDurableDraft({kind:'assistant',resource:'tasks',record_id:null,base_version:null,title:'Помощник: '+text.slice(0,100),context:{form:'assistant-composer',page:'assistant'},data:{text,scope:'team'},onRestore:data=>setText(String(data.text||''))});const [result,setResult]=useState<{type:string;text:string;draft?:Record<string,unknown>;sources?:{id:number;title:string;snippet:string;resource:string;record_id:number}[]}|null>(null);const command=useMutation({mutationFn:async(value:string)=>{await durable.flush({text:value,scope:'team'});return post<NonNullable<typeof result>>('/assistant/interpret',{text:value});},onSuccess:setResult});const send=(value:string)=>{setText(value);command.mutate(value);};return <><PageHead title="Помощник" description="Поручения и поиск по знаниям хозяйства."/><div className="assistant-layout"><section className="assistant-main"><div className="assistant-caption"><span className="assistant-mark"><Sparkles size={22}/></span><div><h2>С чего начнём?</h2><p>Опиши дело или найди сведения в документах.</p></div></div><DraftStatus draft={durable}/><form className="assistant-composer" onSubmit={e=>{e.preventDefault();if(text.trim())send(text.trim());}}><label htmlFor="assistant-text" className="sr-only">Текст поручения или вопрос</label><textarea id="assistant-text" value={text} onChange={e=>setText(e.target.value)} placeholder="Например: поставь Ивану задачу проверить трактор №7 к следующей пятнице" rows={4} required/><div className="composer-footer"><span>{bootstrap.capabilities.ai?'Языковая модель подключена':'Команды и поиск без языковой модели'}</span><Button type="submit" variant="primary" loading={command.isPending}><Send size={17}/>Разобрать</Button></div></form>{bootstrap.capabilities.speech?<SpeechInput targetId="assistant-text" fieldLabel="Команда помощнику"/>:null}{session.user.role==='admin'&&text.trim()?<div className="assistant-note-action"><Button onClick={()=>open({resource:'notes',mode:'new',draft:{title:text.trim().slice(0,120),body:text.trim(),category:'Мысли'}})}>Сохранить как заметку</Button></div>:null}<div className="suggestions"><Button onClick={()=>send('Поставь Ивану задачу проверить трактор №7 завтра')}>Поручение по технике</Button><Button onClick={()=>send('Какие запасы заканчиваются?')}>Проверить остатки</Button><Button onClick={()=>send('Найди регламент обслуживания техники')}>Найти документ</Button></div>{command.error?<ErrorBox message={readableError(command.error)}/>:null}{result?<section className="assistant-result" aria-live="polite"><h3>{result.type==='task_draft'?'Черновик поручения':'Результат'}</h3><p className="pre-line">{result.text}</p>{result.draft?<><dl className="facts"><div className="fact"><dt>Поручение</dt><dd>{String(result.draft.title||'Новое поручение')}</dd></div><div className="fact"><dt>Срок</dt><dd>{dateText(result.draft.due_date)}</dd></div></dl>{session.user.role==='admin'?<Button variant="primary" onClick={()=>open({resource:'tasks',mode:'new',draft:{status:'planned',priority:'normal',recurrence:'none',...result.draft}})}>Проверить и сохранить</Button>:null}</>:null}{result.sources?.length?<div className="knowledge-results">{result.sources.map(source=><button key={source.id} onClick={()=>void api<RecordData>(`/${source.resource||'documents'}/${source.record_id||source.id}`).then(record=>open({resource:source.resource||'documents',record,mode:'view'})).catch(reason=>notify(readableError(reason)))}><FileText size={18}/><span><strong>{source.title}</strong><small>{source.snippet}</small></span></button>)}</div>:null}</section>:null}</section><aside className="assistant-notes" aria-label="Возможности помощника"><h3>Что работает сейчас</h3><ul><li><Check size={16}/>Создание черновика поручения</li><li><Check size={16}/>Поиск по загруженным документам</li><li><Check size={16}/>Сводки задач и остатков</li></ul><div className="capability"><Mic size={20}/><div><strong>{bootstrap.capabilities.speech?'Распознавание речи доступно':'Голос пока не подключён'}</strong><p>Текстовый ввод работает самостоятельно. Неизвестные данные в поручении можно уточнить перед сохранением.</p></div></div><p>Помощник не отправляет сообщения сотрудникам самостоятельно. Каждый черновик проходит согласование.</p></aside></div></>;}

function calendarWhen(event:CalendarItem,compact=false){
 const end=event.end&&event.end!==event.start?event.end:undefined;
 if(!compact||!event.start.includes('T'))return dateText(event.start)+(end?' - '+dateText(end):'');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
 const spansDays=end&&day.format(new Date(event.start))!==day.format(new Date(end));
 const format=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',...(spansDays?{day:'numeric',month:'short'} as const:{})});
 return format.format(new Date(event.start))+(end?' - '+format.format(new Date(end)):'');
}

export function CalendarPage(){
 const {open,session}=useApp();
 const [month,setMonth]=useState(()=>new Date(today()+'T12:00:00'));
 const [error,setError]=useState('');
 const first=new Date(month.getFullYear(),month.getMonth(),1);
 const last=new Date(month.getFullYear(),month.getMonth()+1,0);
 const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const query=useQuery({queryKey:['calendar',iso(first)],queryFn:()=>api<{items:CalendarItem[]}>(`/calendar?start=${iso(first)}&end=${iso(last)}`)});
 const events=query.data?.items||[];
 const cells:(Date|null)[]=[...Array.from({length:(first.getDay()+6)%7},()=>null),...Array.from({length:last.getDate()},(_,index)=>new Date(month.getFullYear(),month.getMonth(),index+1))];
 const openEvent=async(event:CalendarItem)=>{if(!event.resource||!event.record_id)return;try{const row=await api<RecordData>(`/${event.resource}/${event.record_id}`);open({resource:event.resource,record:row,mode:'view'});}catch(e){setError(readableError(e));}};
 return <>
  <PageHead title="Календарь" description="Встречи, задачи, памятные даты и обслуживание." actions={canWrite(session,'events')?<Button variant="primary" onClick={()=>open({resource:'events',mode:'new'})}><Plus size={17}/>Событие</Button>:null}/>
  <div className="calendar-toolbar"><Button className="icon-button" aria-label="Предыдущий месяц" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={20}/></Button><h2>{new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(month)}</h2><Button className="icon-button" aria-label="Следующий месяц" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={20}/></Button><Button onClick={()=>setMonth(new Date(today()+'T12:00:00'))}>Сегодня</Button></div>
  {error?<ErrorBox message={error}/>:null}
  {query.isLoading?<Loading/>:query.error?<ErrorBox message={readableError(query.error)}/>:<>
   <div className="month-grid">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=><div className="weekday" key={day}>{day}</div>)}{cells.map((day,index)=><div key={index} className={`calendar-day ${day&&iso(day)===today()?'is-today':''}`}>{day?<><time dateTime={iso(day)}>{day.getDate()}</time>{events.filter(event=>overlapsMoscowDay(event,iso(day))).map(event=><button key={event.id} className={'calendar-event kind-'+event.kind} onClick={()=>void openEvent(event)}><span>{event.title}</span>{event.start.includes('T')?<small>{calendarWhen(event,true)}</small>:null}</button>)}</>:null}</div>)}</div>
   <div className="mobile-agenda">{events.length?events.map(event=><button className="simple-record" key={event.id} onClick={()=>void openEvent(event)}><span><small>{calendarWhen(event)}</small><strong>{event.title}</strong></span><ArrowRight size={18} aria-hidden/></button>):<Empty>В этом месяце событий пока нет.</Empty>}</div>
  </>}
 </>;
}

export function StockMovement({record,draftKey,onDone}:{record:RecordData;draftKey?:string;onDone:()=>void}){
 const {notify}=useApp();
 const [direction,setDirection]=useState('out');
 const [quantity,setQuantity]=useState('');
 const [unitCost,setUnitCost]=useState('');
 const [note,setNote]=useState('');
 const [idempotency,setIdempotency]=useState<string>(()=>crypto.randomUUID());
 const durable=useDurableDraft({draftKey,kind:'movement',resource:'stock',record_id:record.id,base_version:record.version,title:'Движение: '+recordTitle(record),context:{form:'stock-movement',page:'stock'},data:{direction,quantity,unit_cost:unitCost,note,occurred_on:today(),idempotency_key:idempotency},onRestore:data=>{setDirection(String(data.direction||'out'));setQuantity(String(data.quantity||''));setUnitCost(String(data.unit_cost||''));setNote(String(data.note||''));setIdempotency(String(data.idempotency_key||crypto.randomUUID()));}});
 const mutation=useMutation({mutationFn:()=>durable.submit(`/stock/${record.id}/movements`,{direction,quantity,...(direction==='in'?{unit_cost:unitCost}:{}),note,occurred_on:today(),idempotency_key:idempotency}),onSuccess:async()=>{await refresh();notify('Движение записано, остаток обновлён');onDone();}});
 return <form onSubmit={(event:FormEvent)=>{event.preventDefault();mutation.mutate();}}>
  <DraftStatus draft={durable}/><p className="notice">{recordTitle(record)}. Текущий остаток: {String(record.quantity)} {String(record.unit||'')}.</p>
  <div className="form-grid">
   <div className="field"><label htmlFor="movement-direction">Операция</label><select id="movement-direction" value={direction} onChange={e=>setDirection(e.target.value)}><option value="out">Расход</option><option value="in">Приход</option></select></div>
   <div className="field"><label htmlFor="movement-quantity">Количество, {String(record.unit||'ед.')}</label><input id="movement-quantity" value={quantity} onChange={e=>setQuantity(e.target.value)} inputMode="decimal" required/></div>
   {direction==='in'?<div className="field full"><label htmlFor="movement-cost">Цена закупки за {String(record.unit||'единицу')}, ₽</label><input id="movement-cost" value={unitCost} onChange={e=>setUnitCost(e.target.value)} inputMode="decimal" required/><HelpHint label="Цена закупки">Укажи цену закупки с точностью до копеек. Средняя стоимость остатка пересчитается с учётом прихода.</HelpHint></div>:null}
   <div className="field full"><label htmlFor="movement-note">Основание</label><textarea id="movement-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Например: работа трактора на поле Северное"/></div>
  </div>
  {mutation.error?<ErrorBox message={readableError(mutation.error)}/>:null}
  <div className="dialog-actions"><Button type="submit" variant="primary" loading={mutation.isPending}>Записать движение</Button></div>
 </form>;
}

export function DocumentsTools(){
 const {notify,session,bootstrap,open}=useApp();
 const [search,setSearch]=useState('');
 const [term,setTerm]=useState('');
 const [upload,setUpload]=useState(false);const [uploadValues,setUploadValues]=useState({title:'',category:'Инструкции',asset_id:'',filename:''});
 const durable=useDurableDraft({kind:'document',resource:'documents',record_id:null,base_version:null,title:uploadValues.title||'Загрузка документа',context:{form:'document-upload',page:'documents'},data:uploadValues,onRestore:data=>{setUploadValues({title:String(data.title||''),category:String(data.category||''),asset_id:String(data.asset_id||''),filename:String(data.filename||'')});setUpload(true);}});
 const searchInput=useRef<HTMLInputElement>(null);
 const results=useQuery({queryKey:['knowledge',term],queryFn:()=>api<{items:{id:number;title:string;snippet:string;resource:string;record_id:number}[]}>(`/knowledge/search?q=${encodeURIComponent(term)}`),enabled:!!term});
 const mutation=useMutation({mutationFn:(form:FormData)=>durable.submit('/documents/upload',form),onSuccess:async()=>{await refresh();const empty={title:'',category:'Инструкции',asset_id:'',filename:''};durable.startNew(null,empty);setUploadValues(empty);setUpload(false);notify('Документ загружен и добавлен в поиск');}});
 const clearSearch=()=>{setSearch('');setTerm('');searchInput.current?.focus();};
 return <div className="document-tools">
  <div className="document-options">
   <details className="knowledge-disclosure"><summary>Найти фрагмент в документах</summary><HelpHint label="Поиск фрагментов">Поиск по тексту документов и записей хозяйства.</HelpHint>
    <form className="knowledge-search" aria-label="Поиск по содержимому" onSubmit={e=>{e.preventDefault();setTerm(search.trim());}}><label className="search-field"><Search size={18} aria-hidden/><span className="sr-only">Слово или фраза в содержимом</span><input ref={searchInput} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Слово или фраза в тексте" type="search" required/></label><Button type="submit" loading={results.isFetching}>Найти фрагменты</Button>{term?<Button onClick={clearSearch}>Очистить запрос</Button>:null}</form>
    <p className="search-result-status" role="status">{term&&!results.isFetching&&!results.error&&results.data?'Найдено источников: '+results.data.items.length:''}</p>
    {term?<div className="knowledge-results">{results.error?<ErrorBox message={readableError(results.error)}/>:results.data?.items.length?results.data.items.map(source=><button key={source.id} onClick={()=>void api<RecordData>(`/${source.resource||'documents'}/${source.record_id||source.id}`).then(record=>open({resource:source.resource||'documents',record,mode:'view'})).catch(reason=>notify(readableError(reason)))}><FileText size={18} aria-hidden/><span><strong>{source.title}</strong><small>{source.snippet}</small></span></button>):results.isFetching?<Loading/>:<Empty action={<Button onClick={clearSearch}>Изменить запрос</Button>}>В содержимом совпадений нет. Попробуй другое слово или загрузи нужный документ.</Empty>}</div>:null}
   </details>
   {canWrite(session,'documents')?<Button onClick={()=>setUpload(v=>!v)} aria-expanded={upload} aria-controls="document-upload"><Plus size={16}/>Загрузить документ</Button>:null}
  </div>
  {upload?<form id="document-upload" className="upload-form" onSubmit={e=>{e.preventDefault();mutation.mutate(new FormData(e.currentTarget));}}><DraftStatus draft={durable}/>{uploadValues.filename?<p className="notice">Выбран ранее: {uploadValues.filename}. Выбери файл снова - содержимое файла не хранится в черновике.</p>:null}
   <div className="form-grid">
    <div className="field full"><label htmlFor="upload-file">Файл PDF, DOCX или текстовый документ</label><input id="upload-file" name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv" required onChange={event=>setUploadValues(value=>({...value,filename:event.target.files?.[0]?.name||''}))}/></div>
    <div className="field"><label htmlFor="upload-title">Название</label><input id="upload-title" name="title" value={uploadValues.title} onChange={event=>setUploadValues(value=>({...value,title:event.target.value}))} required/></div>
    <div className="field"><label htmlFor="upload-category">Категория</label><input id="upload-category" name="category" value={uploadValues.category} onChange={event=>setUploadValues(value=>({...value,category:event.target.value}))}/></div>
    <div className="field"><label htmlFor="upload-asset">Объект хозяйства</label><select id="upload-asset" name="asset_id" value={uploadValues.asset_id} onChange={event=>setUploadValues(value=>({...value,asset_id:event.target.value}))}><option value="">Без привязки</option>{bootstrap.lookups.assets?.map(asset=><option value={asset.id} key={asset.id}>{recordTitle(asset)}</option>)}</select></div>
   </div>
   {mutation.error?<ErrorBox message={readableError(mutation.error)}/>:null}
   <div className="form-actions"><Button onClick={()=>setUpload(false)}>Отмена</Button><Button type="submit" variant="primary" loading={mutation.isPending}>Загрузить</Button></div>
  </form>:null}
 </div>;
}
