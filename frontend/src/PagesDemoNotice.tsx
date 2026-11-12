import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, ErrorBox, HelpHint, Modal } from './ui';
import { resetPagesDemo } from './pagesDemo';
import './pages-demo.css';

export function PagesDemoNotice(){
 const [confirm,setConfirm]=useState(false);const [issue,setIssue]=useState('');
 useEffect(()=>{
  const download=(event:MouseEvent)=>{
   if(event.defaultPrevented||!(event.target instanceof Element))return;
   const link=event.target.closest('a');if(!link)return;const target=new URL(link.href,location.href);
   if(target.origin!==location.origin||!target.pathname.startsWith('/api/'))return;
   event.preventDefault();setIssue('');
   void fetch(target).then(async response=>{if(!response.ok){const result=await response.json();throw Error(result.detail||'Не удалось скачать пример.');}const blob=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=blob;anchor.download=response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/)?.[1]||target.pathname.split('/').pop()||'demo';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(blob),1000);}).catch(error=>setIssue(error instanceof Error?error.message:'Не удалось скачать пример.'));
  };
  document.addEventListener('click',download);document.addEventListener('auxclick',download);
  return()=>{document.removeEventListener('click',download);document.removeEventListener('auxclick',download);};
 },[]);
 return <><aside className="pages-demo-notice" aria-label="Условия демонстрации"><div className="pages-demo-copy"><strong>Smart Assistant · демоверсия</strong><span>Вымышленное хозяйство. Изменения сохраняются только в этом браузере.</span></div><div className="actions"><HelpHint label="О публичной демоверсии">Можно создавать задачи, вести журнал и проверять ТО на учебных данных. Настоящий сервер, микрофон, аккаунты и внешние системы здесь не подключены. Не вводи рабочие документы, пароли и персональные данные. Excel показывает образец отчёта; CSV отражает текущие данные демоверсии.</HelpHint><Button onClick={()=>setConfirm(true)}><RotateCcw aria-hidden/>Сбросить демо</Button></div>{issue?<ErrorBox message={issue}/>:null}</aside>{confirm?<Modal title="Сбросить демоверсию?" description="Будут удалены только изменения этой демонстрации в текущем браузере." onClose={()=>setConfirm(false)}><p>Учебные записи восстановятся. Другие сайты и вкладки не изменятся.</p><div className="dialog-actions"><Button onClick={()=>setConfirm(false)}>Отмена</Button><Button variant="danger" onClick={()=>{dispatchEvent(new Event('sa:drafts-clear'));resetPagesDemo();}}>Сбросить изменения</Button></div></Modal>:null}</>;
}
