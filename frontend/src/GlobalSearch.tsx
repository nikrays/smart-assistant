import { useEffect, useId, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpRight, FileText, Search } from 'lucide-react';
import { api, readableError } from './api';
import { Button, ErrorBox, Modal, useApp } from './ui';
import { canVisit } from './permissions';
import { helpArticles } from './OnboardingHelp';
import { MarkedText, searchMatches } from './searchText';
import type { RecordData } from './types';

type SearchItem={resource:string;id:number;title:string;snippet:string;matched_fields:string[];route:string;version:number};
type SearchResponse={query:string;items:SearchItem[];total:number;offset:number;limit:number};
type Result={key:string;kind:'record'|'page'|'help';title:string;subtitle:string;record?:SearchItem;route?:string;topic?:string};
const pages=[['today','Сегодня'],['personal','Личные задачи'],['drafts','Черновики'],['favorites','Избранное'],['journal','Ежедневный журнал'],['maintenance','Техника и ТО'],['field-scheme','Схема полей'],['assistant','Помощник'],['tasks','Поручения'],['calendar','Календарь'],['people','Команда'],['farm','Хозяйство'],['stock','Склад'],['projects','Проекты'],['experiments','Опыты'],['calculations','Расчёты и отчёты'],['documents','Документы'],['notes','Заметки'],['settings/account','Мой аккаунт'],['settings/users','Учётные записи и права'],['settings/organization','Организация'],['settings/integrations','Подключения и 1С'],['settings/notifications','Уведомления Telegram MAX'],['settings/data','Данные и резервные копии'],['help','Помощь']] as const;

export function GlobalSearch(){
 const {session,meta,navigate,open:openRecord}=useApp();const [open,setOpen]=useState(false);const [text,setText]=useState('');const [query,setQuery]=useState('');const [active,setActive]=useState(0);const [opening,setOpening]=useState(false);const [error,setError]=useState('');const [scroller,setScroller]=useState<HTMLDivElement|null>(null);const resultsId=useId();
 const mounted=useRef(true);const request=useRef<AbortController|null>(null);const identity=session.user.id+':'+session.user.version;const currentIdentity=useRef(identity);currentIdentity.current=identity;
 const openState=useRef(open);openState.current=open;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
 useEffect(()=>{request.current?.abort();setOpen(false);setText('');setQuery('');},[identity]);
 const close=()=>{request.current?.abort();setOpen(false);setOpening(false);};
 const pending=text.trim()!==query;
 useEffect(()=>{const timer=setTimeout(()=>setQuery(text.trim()),150);setActive(0);return()=>clearTimeout(timer);},[text]);
 useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if(!event.repeat&&!event.shiftKey&&!event.altKey&&(event.ctrlKey||event.metaKey)&&(event.code==='KeyK'||event.key.toLowerCase()==='k')){event.preventDefault();if(openState.current)close();else setOpen(true);}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>document.getElementById('global-search-input')?.focus());return()=>cancelAnimationFrame(frame);},[open]);
 const found=useInfiniteQuery({queryKey:['global-search',session.user.id,session.user.version,query],enabled:open&&query.length>0,initialPageParam:0,queryFn:({pageParam,signal})=>api<SearchResponse>('/search?q='+encodeURIComponent(query)+'&limit=30&offset='+pageParam,{signal}),getNextPageParam:last=>last.offset+last.items.length<last.total?last.offset+last.items.length:undefined,staleTime:15000,retry:0});
 const records=!pending&&query?found.data?.pages.flatMap(page=>page.items)||[]:[];
 const menu=pages.filter(([route,title])=>canVisit(session,route)&&(!text.trim()||searchMatches(title,text))).map(([route,title]):Result=>({key:'page:'+route,kind:'page',title,subtitle:'Раздел',route}));
 const help=text.trim()?helpArticles.filter(article=>canVisit(session,article.next)&&searchMatches(article.title+' '+article.summary+' '+article.steps.join(' '),text)).slice(0,12).map((article):Result=>({key:'help:'+article.key,kind:'help',title:article.title,subtitle:'Помощь · '+article.summary,topic:article.key})):[];
 const items:Result[]=[...records.map((record):Result=>({key:'record:'+record.id,kind:'record',title:record.title,subtitle:(meta.resources.find(resource=>resource.key===record.resource)?.label||'Запись')+' · '+record.snippet,record})),...menu,...help];
 const current=Math.min(active,Math.max(0,items.length-1));
 const virtual=useVirtualizer({count:items.length,getScrollElement:()=>scroller,estimateSize:()=>88,overscan:5,getItemKey:index=>items[index].key,rangeExtractor:range=>Array.from(new Set([...defaultRangeExtractor(range),current])).filter(index=>index>=0&&index<items.length).sort((a,b)=>a-b)});
 const select=async(item:Result)=>{
  if(opening)return;setError('');setOpening(true);
  try{
   if(item.record){const controller=new AbortController();request.current=controller;const record=await api<RecordData>('/'+item.record.resource+'/'+item.record.id,{signal:controller.signal});if(!mounted.current||controller.signal.aborted||currentIdentity.current!==identity)return;setOpen(false);setTimeout(()=>{if(mounted.current&&!controller.signal.aborted&&currentIdentity.current===identity)openRecord({resource:item.record!.resource,record,mode:'view',searchQuery:query});},0);}
   else{setOpen(false);if(item.topic)window.dispatchEvent(new CustomEvent('sa:help-open',{detail:{key:item.topic,query:text.trim()}}));else if(item.route)navigate(item.route);}
  }catch(reason){if(mounted.current&&!(reason instanceof DOMException&&reason.name==='AbortError'))setError(readableError(reason));}finally{if(mounted.current)setOpening(false);}
 };
 const count=found.data?.pages[0]?.total||0;
 return <><Button className="global-search-trigger" onClick={()=>setOpen(true)} aria-label="Глобальный поиск"><Search size={18} aria-hidden/><span>Поиск</span><kbd>Ctrl K</kbd></Button>{open?<Modal title="Поиск по хозяйству" description="Записи, документы, разделы и помощь. Видны только данные, доступные твоей учётной записи." wide onClose={close}><div className="global-search">
  <label className="search-field"><Search size={18} aria-hidden/><span className="sr-only">Поиск по всему хозяйству</span><input id="global-search-input" type="search" autoComplete="off" maxLength={200} value={text} onChange={event=>{setText(event.target.value);setError('');}} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={resultsId} aria-activedescendant={items.length?resultsId+'-'+current:undefined} placeholder="Название, номер, человек или фрагмент текста" onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!items.length)return;const next=Math.max(0,Math.min(items.length-1,current+(event.key==='ArrowDown'?1:-1)));setActive(next);virtual.scrollToIndex(next,{align:'auto'});}else if(event.key==='Enter'){event.preventDefault();if(items[current]&&!pending)void select(items[current]);}}}/></label>
  <p className="search-summary" role="status">{!text.trim()?'Открой раздел или начни вводить запрос.':pending||found.isFetching&&!found.isFetchingNextPage?'Ищем…':count+' записей'+(menu.length+help.length?' · '+(menu.length+help.length)+' разделов и подсказок':'')}</p>
  {found.error?<ErrorBox message={readableError(found.error)} retry={()=>void found.refetch()}/>:null}{error?<ErrorBox message={error}/>:null}
  <div className={'global-search-results'+(text.trim()&&!pending&&!found.isFetching&&!items.length?' search-results-empty':'')} ref={setScroller} id={resultsId} role="listbox" aria-label="Результаты поиска"><div className="search-result-space" style={{height:virtual.getTotalSize(),position:'relative'}}>{virtual.getVirtualItems().map(row=>{const item=items[row.index];return <button key={item.key} id={resultsId+'-'+row.index} data-index={row.index} ref={virtual.measureElement} type="button" role="option" tabIndex={-1} aria-selected={current===row.index} className="search-result" style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${row.start}px)`}} onMouseDown={event=>event.preventDefault()} onMouseMove={()=>setActive(row.index)} onClick={()=>void select(item)} disabled={opening}>{item.kind==='record'?<FileText size={18} aria-hidden/>:<ArrowUpRight size={18} aria-hidden/>}<span><strong><MarkedText text={item.title} query={text}/></strong><small><MarkedText text={item.subtitle} query={text}/></small></span></button>;})}</div></div>
  {text.trim()&&!pending&&!found.isFetching&&!items.length?<p className="search-empty">Ничего не найдено. Попробуй часть названия или другое слово.</p>:null}
  {found.hasNextPage?<Button loading={found.isFetchingNextPage} onClick={()=>void found.fetchNextPage()}>Ещё записи</Button>:null}
 </div></Modal>:null}</>;
}
