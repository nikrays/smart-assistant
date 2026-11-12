import { Star, X } from 'lucide-react';
import { api, queryClient } from './api';
import { useHorizontalReveal } from './useHorizontalReveal';
import { canVisit } from './permissions';
import { Button, Empty, PageHead } from './ui';
import type { Meta, NavigationState, Session } from './types';

export const emptyNavigation:NavigationState={version:0,opened:[],favorites:[],sections:{},active:'today'};
export type NavigationAction={action:'visit'|'close'|'favorite'|'unfavorite';page:string;section?:string};

export function newerNavigation(old:unknown,value:unknown){
 const previous=old as NavigationState|undefined;const next=value as NavigationState;
 return previous&&previous.version>next.version?previous:next;
}

export async function updateNavigation(action:NavigationAction,owner:Session['user']){
 const value=await api<NavigationState>('/navigation',{method:'PATCH',body:JSON.stringify(action)});
 const current=queryClient.getQueryData<Session|null>(['session'])?.user;
 if(current?.id!==owner.id||current.version!==owner.version)return null;
 queryClient.setQueryData(['navigation'],old=>newerNavigation(old,value));return value;
}

const titles:Record<string,string>={today:'Сегодня',calendar:'Календарь',personal:'Личные задачи',journal:'Ежедневный журнал',maintenance:'Техника и ТО','field-scheme':'Схема полей',farm:'Объекты хозяйства',people:'Команда',projects:'Проекты и опыты',calculations:'Расчёты и отчёты','saved-calculations':'Сохранённые расчёты',reports:'Отчёты',assistant:'Помощник',drafts:'Черновики',help:'Помощь',start:'Начало работы',favorites:'Избранное','settings/organization':'Параметры хозяйства','settings/account':'Мой аккаунт','settings/users':'Доступ сотрудников','settings/integrations':'Подключения','settings/notifications':'Уведомления','settings/data':'Данные и копии'};
export function pageTitle(page:string,meta:Meta){return titles[page]||meta.resources.find(resource=>resource.key===page)?.label||'Раздел';}

export function OpenSections({state,page,meta,session,onClose}:{state:NavigationState;page:string;meta:Meta;session:Session;onClose:(page:string)=>void}){
 const pages=state.opened.filter(key=>canVisit(session,key));
 if(!pages.includes(page)&&canVisit(session,page))pages.push(page);
 if(pages.length>6)pages.splice(0,pages.length-6);
 const order=pages.join('|');
 const ref=useHorizontalReveal<HTMLElement>(page+'|'+order,'.open-section.active');
 if(pages.length<2)return null;
 return <nav ref={ref} className="open-sections" aria-label="Открытые разделы" data-guide="open-sections">{pages.map(key=><div className={'open-section '+(key===page?'active':'')} key={key}><a href={'#'+key} aria-current={key===page?'page':undefined} title={pageTitle(key,meta)}><span>{pageTitle(key,meta)}</span></a><Button className="icon-button" aria-label={'Закрыть раздел: '+pageTitle(key,meta)} onClick={()=>onClose(key)}><X aria-hidden/></Button></div>)}</nav>;
}

export function FavoritesPage({state,meta,onRemove}:{state:NavigationState;meta:Meta;onRemove:(page:string)=>void}){
 return <><PageHead title="Избранное" description="Отметь раздел звёздочкой у его заголовка. Закладки сохраняются в твоём аккаунте."/><div className="favorite-list" data-guide="favorites">{state.favorites.length?state.favorites.map(page=><div className="favorite-row" key={page}><a href={'#'+page}><Star size={18} aria-hidden/><span>{pageTitle(page,meta)}</span></a><Button className="icon-button" aria-label={'Убрать из избранного: '+pageTitle(page,meta)} onClick={()=>onRemove(page)}><X aria-hidden/></Button></div>):<Empty>Пока нет избранного. Открой нужный раздел и нажми звёздочку рядом с названием.</Empty>}</div></>;
}
