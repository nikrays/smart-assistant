import { lazy, Suspense, useEffect, useState } from 'react';
import { Bell, Building2, Database, Link2, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, Modal, PageHead, Panel, useApp } from './ui';
import { WorkspaceSetup } from './OnboardingHelp';
import { canVisit } from './permissions';
import { useDraftStore } from './Drafts';
import { useHorizontalReveal } from './useHorizontalReveal';

const AccountPage=lazy(()=>import('./AccountPages').then(module=>({default:module.AccountPage})));
const AccountsPage=lazy(()=>import('./AccountPages').then(module=>({default:module.AccountsPage})));
const Integrations=lazy(()=>import('./Integrations'));
const NotificationSettings=lazy(()=>import('./NotificationSettings'));
const DataSettings=lazy(()=>import('./ManagementPages').then(module=>({default:module.DataSettings})));

export const settingsSections=[
 {key:'organization',label:'Организация',description:'Название хозяйства, направления и параметры расчётов.',icon:Building2},
 {key:'account',label:'Мой аккаунт',description:'Профиль, пароль и локальное восстановление доступа.',icon:UserRound},
 {key:'users',label:'Сотрудники и доступ',description:'Отдельные аккаунты и явный доступ к рабочим разделам.',icon:ShieldCheck},
 {key:'integrations',label:'Подключения',description:'Источники учётных данных и ручной обмен файлами.',icon:Link2},
 {key:'notifications',label:'Уведомления',description:'Параметры каналов и локальная проверка шаблонов.',icon:Bell},
 {key:'data',label:'Данные',description:'Резервная копия, восстановление и демонстрационные данные.',icon:Database},
] as const;

export default function SettingsPage({section}:{section:string}){
 const {session}=useApp();const current=settingsSections.find(item=>item.key===section);const visible=settingsSections.filter(item=>canVisit(session,'settings/'+item.key));
 const index=useHorizontalReveal<HTMLElement>(section,'[aria-current="page"]');
 if(!current)return <><PageHead title="Настройки"/><Empty action={<a className="button" href="#settings">Открыть настройки</a>}>Этот раздел настроек не найден.</Empty></>;
 if(!canVisit(session,'settings/'+section))return <><PageHead title="Настройки"/><ErrorBox message="У этого аккаунта нет доступа к разделу."/><a className="button" href="#settings/account">Открыть мой аккаунт</a></>;
 return <><PageHead title={current.label} description={current.description}/><div className="settings-layout"><nav ref={index} className="settings-index" aria-label="Разделы настроек">{visible.map(item=><a key={item.key} href={'#settings/'+item.key} className={'settings-link '+(item.key===section?'active':'')} aria-current={item.key===section?'page':undefined}><item.icon size={19} aria-hidden/><span>{item.label}</span></a>)}</nav><div className="settings-content"><Suspense fallback={<Loading/>}>{section==='organization'?<OrganizationSettings/>:section==='account'?<AccountPage/>:section==='users'?<AccountsPage/>:section==='integrations'?<Integrations embedded/>:section==='notifications'?<NotificationSettings/>:<DataSettings/>}</Suspense></div></div></>;
}

function OrganizationSettings(){
 const {workspace}=useApp();const drafts=useDraftStore();const [editing,setEditing]=useState(false);const preferred=drafts.preferred.get('workspace-settings');
 useEffect(()=>{if(preferred&&drafts.entries.get(preferred)?.input.resource==='workspace')setEditing(true);},[drafts,preferred]);
 return <><Panel title={workspace?.name||'Организация'} action={<Button onClick={()=>setEditing(true)}>Изменить параметры</Button>}><dl className="facts"><div className="fact"><dt>Название</dt><dd>{workspace?.name||'Не указано'}</dd></div><div className="fact"><dt>Направления</dt><dd>{workspace?.activity||'Не указаны'}</dd></div><div className="fact"><dt>Подразделения</dt><dd>{workspace?.departments.join(', ')||'Не указаны'}</dd></div><div className="fact"><dt>Часовой пояс</dt><dd>{workspace?.time_zone||'Europe/Moscow'}</dd></div><div className="fact"><dt>Валюта</dt><dd>{workspace?.currency||'RUB'}</dd></div><div className="fact"><dt>Режим данных</dt><dd>{workspace?.demo?'Демонстрационные':'Рабочие'}</dd></div></dl></Panel>{editing?<Modal title="Параметры организации" onClose={()=>setEditing(false)} wide><WorkspaceSetup onSaved={()=>setEditing(false)}/></Modal>:null}</>;
}
