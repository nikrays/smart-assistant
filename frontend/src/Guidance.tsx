import { useEffect, useMemo, useRef, useState } from 'react';
import type { Driver } from 'driver.js';
import { Button, ErrorBox } from './ui';
import { guideSteps } from './guideSteps';
import { readableError } from './api';
import type { GuideProgress, Session } from './types';

export function GuidedTour({progress,page,section,session,onNavigate,onProgress,onStop,onHelp,onRetry}:{progress:GuideProgress;page:string;section?:string;session:Session;onNavigate:(page:string,section?:string)=>void;onProgress:(value:GuideProgress)=>Promise<void>;onStop:(completed?:boolean)=>void;onHelp:()=>void;onRetry:()=>void}){
 const steps=useMemo(()=>guideSteps(progress,session),[progress.mode,progress.page,progress.section,session]);
 const index=Math.max(0,Math.min(progress.step,steps.length-1));const target=steps[index];
 const instance=useRef<Driver|null>(null);const [ready,setReady]=useState(false);const [issue,setIssue]=useState('');const [pending,setPending]=useState(false);
 const actions=useRef({move:(_delta:number)=>{},stop:(_done?:boolean)=>{},help:()=>{}});
 actions.current={move:delta=>{if(pending)return;const next=index+delta;if(next>=steps.length){onStop(true);return;}if(next<0)return;setPending(true);setIssue('');void onProgress({...progress,step:next}).catch(error=>setIssue(readableError(error))).finally(()=>setPending(false));},stop:onStop,help:onHelp};
 const key=progress.mode+':'+progress.page+':'+(progress.section||'')+':'+session.user.id+':'+session.user.version;
 useEffect(()=>{
  let disposed=false;let current:Driver|undefined;const controlled=new Set<Element>();setReady(false);setIssue('');
  void Promise.all([import('driver.js'),import('driver.js/dist/driver.css')]).then(([module])=>{
   if(disposed)return;
   const tokens=getComputedStyle(document.documentElement);
   current=module.driver({animate:false,smoothScroll:false,overlayOpacity:.56,overlayColor:tokens.getPropertyValue('--ground').trim(),stagePadding:parseFloat(tokens.getPropertyValue('--space-2')),stageRadius:parseFloat(tokens.getPropertyValue('--radius')),popoverClass:'guide-popover',popoverOffset:parseFloat(tokens.getPropertyValue('--space-3')),showProgress:true,progressText:'Шаг {{current}} из {{total}}',nextBtnText:'Далее',prevBtnText:'Назад',doneBtnText:'Закончить',closeBtnLabel:'Закрыть тур',showButtons:['previous','next','close'],allowClose:true,overlayClickBehavior:'none',disableActiveInteraction:true,waitForElement:5000,steps:steps.map(item=>({element:()=>Array.from(document.querySelectorAll(item.target)).find(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=='hidden';})||document.querySelector(item.target)!,popover:{title:item.title,description:item.text}})),onHighlightStarted:element=>{if(element&&!['aria-haspopup','aria-expanded','aria-controls'].some(name=>element.hasAttribute(name))){element.setAttribute('aria-controls','driver-popover-content');controlled.add(element);}},onHighlighted:element=>{if(element instanceof HTMLElement&&parseFloat(getComputedStyle(element).borderTopLeftRadius)===0)element.classList.add('guide-rounded-target');},onDeselected:element=>{element?.classList.remove('guide-rounded-target');if(element&&controlled.delete(element))element.removeAttribute('aria-controls');},onNextClick:()=>actions.current.move(1),onPrevClick:()=>actions.current.move(-1),onDoneClick:()=>actions.current.stop(true),onDestroyStarted:()=>actions.current.stop(false),onPopoverRender:(elements,options)=>{
    const item=steps[options.index??0];elements.wrapper.dataset.guideTarget=item.target;elements.wrapper.dataset.guidePage=item.page;elements.title.textContent=item.title;elements.description.textContent=item.text;
    elements.previousButton.classList.add('button');elements.nextButton.classList.add('button','primary');elements.closeButton.classList.add('button','icon-button');elements.footerButtons.classList.add('tour-controls');
    elements.closeButton.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
    const help=document.createElement('button');help.type='button';help.className='button text guide-help';help.textContent='Подробнее в справке';help.addEventListener('click',()=>actions.current.help());elements.description.append(help);
   }});
   instance.current=current;setReady(true);
  }).catch(()=>{if(!disposed)setIssue('Не удалось загрузить тур. Проверь соединение и обнови страницу. Продолжим с сохранённого шага.');});
  return()=>{disposed=true;current?.destroy();controlled.forEach(element=>element.removeAttribute('aria-controls'));instance.current=null;};
 },[key]);
 useEffect(()=>{
  if(!target)return;
  if(page!==target.page||target.section&&section!==target.section){onNavigate(target.page,target.section);return;}
  if(!ready||!instance.current)return;
  const driver=instance.current;if(driver.isActive())driver.moveTo(index);else driver.drive(index);
 },[ready,index,page,section,key]);
 useEffect(()=>{if(ready)instance.current?.updatePopover({disableButtons:pending?['next','previous']:index===0?['previous']:[]});},[pending,ready,index]);
 return !ready||issue?<aside className="guide-feedback" aria-label="Состояние тура">{issue?<><ErrorBox message={issue}/>{!ready?<Button onClick={onRetry}>Обновить и продолжить</Button>:null}</>:<p role="status">Подготавливаем пояснения...</p>}<Button onClick={()=>onStop(false)}>Закрыть тур</Button></aside>:null;
}
