import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle, ArrowUpRight, Info, Star } from 'lucide-react';
import type { Bootstrap, Field, Meta, Overlay, Preferences, RecordData, Resource, Session, WorkspaceSettings } from './types';
import { api, dateText, money, numberText, readableError, recordTitle, today } from './api';
import { firstSearchMatch, MarkedText } from './searchText';
import { canRead } from './permissions';

export type AppContextValue={session:Session;meta:Meta;bootstrap:Bootstrap;workspace?:WorkspaceSettings;preferences?:Preferences;startTour:(mode?:'overview'|'section',page?:string)=>void;resumeTour:()=>void;favorite?:{active:boolean;pending:boolean;toggle:()=>void};open:(overlay:Overlay)=>void;notify:(message:string)=>void;navigate:(page:string)=>void};
export const AppContext=createContext<AppContextValue|null>(null);
export function useApp(){const value=useContext(AppContext);if(!value)throw Error('App context missing');return value;}
export function Button({children,variant='',className='',loading=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;loading?:boolean}){return <button type="button" {...props} disabled={props.disabled||loading} className={`button ${variant} ${className}`} aria-busy={loading||undefined}>{loading?<LoaderCircle size={17} className="spinner" aria-hidden/>:null}{children}</button>;}
export function HelpHint({label,children,className=''}:{label:string;children:ReactNode;className?:string}){
 const id=useId();const [expanded,setExpanded]=useState(false);const anchor='--help-'+id.replace(/[^a-zA-Z0-9_-]/g,'');
 return <span className={'help-hint '+className} style={{'--help-anchor':anchor} as CSSProperties}><Button className="help-hint-trigger icon-button" popoverTarget={id} aria-label={'Подсказка: '+label} aria-controls={id} aria-expanded={expanded}><Info size={18} aria-hidden/></Button><span id={id} popover="auto" className="help-hint-popover" role="note" aria-label={label} onToggle={event=>setExpanded((event.nativeEvent as ToggleEvent).newState==='open')}><strong>{label}</strong><span className="help-hint-text">{children}</span></span></span>;
}
export function PageHead({title,description,actions}: {title:string;description?:string;actions?:ReactNode}){const context=useContext(AppContext);const favorite=context?.favorite;return <div className="page-head"><div className="page-title"><h1>{title}</h1>{description?<HelpHint label={title}>{description}</HelpHint>:null}{favorite?<Button className="icon-button favorite-toggle" aria-label={favorite.active?"Убрать раздел из избранного":"Добавить раздел в избранное"} aria-pressed={favorite.active} disabled={favorite.pending} onClick={favorite.toggle}><Star aria-hidden/></Button>:null}</div>{actions?<div className="actions">{actions}</div>:null}</div>;}
export function Panel({title,action,children,className=''}:{title?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{title?<div className="section-head"><h2>{title}</h2>{action}</div>:null}{children}</section>;}
export function Empty({children,action}:{children:ReactNode;action?:ReactNode}){return <div className="empty"><p>{children}</p>{action}</div>;}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spinner" size={20}/>Загружаем данные…</div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><p>{message}</p>{retry?<Button onClick={retry}>Повторить</Button>:null}</div>;}
export function Modal({title,description,children,onClose,wide=false,sheet=false,className='',id}:{title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean;sheet?:boolean;className?:string;id?:string}){
 const opener=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
 // Native popovers close before Radix handles the outside click.
 const hintAtPointerDown=useRef(false);
 return <Dialog.Root open onOpenChange={value=>{if(!value)onClose();}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" onPointerDownCapture={()=>{hintAtPointerDown.current=!!document.querySelector('.help-hint-popover:popover-open');}}/><Dialog.Content id={id} onEscapeKeyDown={event=>{const hint=document.querySelector<HTMLElement>('.help-hint-popover:popover-open');if(hint){event.preventDefault();hint.hidePopover();}}} onPointerDownOutside={event=>{if(hintAtPointerDown.current){event.preventDefault();hintAtPointerDown.current=false;document.querySelector<HTMLElement>('.help-hint-popover:popover-open')?.hidePopover();}}} onFocusCapture={event=>{const target=event.target;if(document.documentElement.dataset.input==='keyboard'&&target instanceof HTMLElement&&['INPUT','SELECT','TEXTAREA'].includes(target.tagName))requestAnimationFrame(()=>target.scrollIntoView({block:'nearest',inline:'nearest'}));}} className={`dialog ${wide?'wide':''} ${sheet?'sheet':''} ${className}`} onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected&&opener.current.getClientRects().length)opener.current.focus();else document.getElementById('main')?.focus();}}><div className="dialog-heading"><div className="page-title"><Dialog.Title>{title}</Dialog.Title>{description?<HelpHint label={title}>{description}</HelpHint>:null}<Dialog.Description className="sr-only">{description||'Просмотр или изменение записи'}</Dialog.Description></div><Dialog.Close asChild><Button className="icon-button" aria-label="Закрыть окно"><X size={20}/></Button></Dialog.Close></div><div className="dialog-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Status({value}: {value:unknown}){const labels:Record<string,string>={planned:'Запланировано',in_progress:'В работе',completed:'Выполнено',active:'В работе',paused:'На паузе',draft:'Черновик',approved:'Согласовано',high:'Высокий приоритет',normal:'Обычный',equipment:'Техника',field:'Поле',animal:'Животное',container:'Ёмкость'};const key=String(value||'');return <span className={`badge status-${key}`}>{labels[key]||key||'Не указано'}</span>;}
export const detailLabels:Record<string,string>={manufacturer:'Производитель',model:'Модель',serial:'Заводской номер',attachment:'Прицепное оборудование',area:'Площадь, га',soil:'Почва',crop:'Культура',breed:'Порода',sex:'Пол',birth_date:'Дата рождения',tag:'Бирка',capacity:'Вместимость, л',volume:'Текущий объём, л',sowing_date:'Дата посева',insemination_date:'Дата осеменения',calving_date:'Дата отёла',next_vaccination:'Следующая вакцинация',notes:'Примечание',horsepower:'Мощность, л.с.',year:'Год выпуска',yield_rate:'Норма высева',seed_origin:'Происхождение семян'};
export function resourceLabel(key:string,meta:Meta){return meta.resources.find(r=>r.key===key)?.label||key;}
function ExpandableText({text,searchQuery}:{text:string;searchQuery?:string}){const [expanded,setExpanded]=useState(false);const [start,setStart]=useState(()=>searchQuery?Math.max(0,firstSearchMatch(text,searchQuery)-120):0);useEffect(()=>{if(searchQuery){setStart(Math.max(0,firstSearchMatch(text,searchQuery)-120));setExpanded(false);}},[text,searchQuery]);return <><span className="pre-line">{!expanded&&start>0?'…':null}<MarkedText text={expanded?text:text.slice(start,start+2400)} query={searchQuery}/>{!expanded&&text.length>start+2400?'…':null}</span>{text.length>2400?<button className="text-link" onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть':'Показать полный текст'}</button>:null}</>;}
export function fieldText(field:Field,value:unknown,bootstrap:Bootstrap){
 if(value===null||value===undefined||value==='')return 'Не указано';
 if(field.reference){const found=bootstrap.lookups[field.reference]?.find(r=>String(r.id)===String(value));return found?recordTitle(found):'Запись №'+value;}
 if(field.options)return field.options.find(o=>String(o.value)===String(value))?.label||String(value);
 if(field.type==='money')return money(value);
 if(field.type==='date'||field.type==='datetime')return dateText(value);
 if(field.type==='number')return numberText(value);
 if(typeof value==='boolean')return value?'Да':'Нет';
 if(typeof value==='object')return '';
 return String(value);
}
export function RecordLink({resource,record,children}:{resource:string;record:RecordData;children?:ReactNode}){const {open}=useApp();return <button className="text-link" onClick={()=>open({resource,record,mode:'view'})}>{children||recordTitle(record)}<ArrowUpRight size={14} aria-hidden/></button>;}
export function TaskDeadline({value,status}:{value:unknown;status:unknown}){
 const overdue=Boolean(value)&&String(value).slice(0,10)<today()&&status!=='completed';
 return <span className={overdue?'overdue':''}>{overdue?'Просрочено · ':''}{dateText(value)}</span>;
}

export function RecordRows({resource,items}:{resource:string;items:RecordData[]}){
 const {open,meta,bootstrap}=useApp();
 const def=meta.resources.find(r=>r.key===resource);
 const assignee=def?.fields.find(field=>field.key==='assignee_id');
 return <div className="simple-list">{items.map(record=><button key={record.id} className="simple-record" onClick={()=>open({resource,record,mode:'view'})}>
  <span><strong>{recordTitle(record)}</strong>
   {resource==='tasks'?<small className="task-summary">{assignee?fieldText(assignee,record.assignee_id,bootstrap):''}<span><TaskDeadline value={record.due_date} status={record.status}/></span></small>:<small>{resource==='stock'?'Остаток '+numberText(record.quantity)+' '+String(record.unit||'')+' · минимум '+numberText(record.min_quantity):def?.fields.filter(f=>['assignee_id','recipient_id','due_date','kind','department','unit'].includes(f.key)).slice(0,2).map(f=>fieldText(f,record[f.key],bootstrap)).join(' · ')}</small>}
  </span>
  {record.status?<Status value={record.status}/>:<ArrowUpRight size={16} aria-hidden/>}
 </button>)}</div>;
}
export function FieldsView({resource,record,searchQuery}:{resource:Resource;record:RecordData;searchQuery?:string}){
 const {session,bootstrap,open,notify}=useApp();
 return <dl className="facts">{resource.fields.filter(field=>!['inputs','result'].includes(field.key)&&record[field.key]!==undefined&&record[field.key]!==null&&record[field.key]!=='').map(field=>field.key==='details'&&typeof record.details==='object'?Object.entries(record.details as Record<string,unknown>).filter(([,value])=>value!==''&&value!==null).map(([key,value])=><div className="fact" key={key}><dt>{detailLabels[key]||key}</dt><dd><MarkedText text={String(value)} query={searchQuery}/></dd></div>):<div className={`fact ${field.type==='textarea'?'full':''}`} key={field.key}><dt>{field.label}</dt><dd>{field.reference&&canRead(session,field.reference)?<button className="text-link" onClick={()=>void api<RecordData>(`/${field.reference}/${record[field.key]}`).then(row=>open({resource:field.reference!,record:row,mode:'view'})).catch(error=>notify(readableError(error)))}><MarkedText text={field.reference==='tasks'?'Открыть поручение':fieldText(field,record[field.key],bootstrap)} query={searchQuery}/></button>:field.type==='textarea'?<ExpandableText text={String(record[field.key])} searchQuery={searchQuery}/>:<MarkedText text={fieldText(field,record[field.key],bootstrap)} query={searchQuery}/>}</dd></div>)}</dl>;
}
