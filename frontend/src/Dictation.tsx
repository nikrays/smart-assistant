import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './ui';
import { isVoiceField, rememberVoiceFocus, voiceFieldLabel, type VoiceField } from './voiceField';
import { DeferredSpeechInput } from './SpeechLoader';

let fieldSequence=0;

export function DictationProvider(){
 const {bootstrap,notify}=useApp();const [field,setField]=useState<VoiceField|null>(null);const [position,setPosition]=useState({left:0,top:0,inDialog:false,scale:1});const active=useRef(false);const announce=useRef(notify);announce.current=notify;
 const [requested,setRequested]=useState<{id:string;nonce:number}|null>(null);
 useEffect(()=>{
  if(!bootstrap.capabilities.speech)return;
  const focus=(event:FocusEvent)=>{
   const element=event.target instanceof Element?event.target:null;
   if(element?.closest('.speech-controls,.universal-dictation'))return;
   if(active.current)return;
   setRequested(null);
   if(!isVoiceField(element)){setField(null);return;}
   rememberVoiceFocus(element);
   if(!element.id)element.id='dictation-field-'+(++fieldSequence);
   const form=element.closest('form,details,section');
   if(form?.querySelector('.speech-controls:not(.speech-compact)')){setField(null);return;}
   setField(element);
  };
  document.addEventListener('focusin',focus);
  const shortcut=(event:KeyboardEvent)=>{
   if(event.repeat||event.shiftKey||!event.altKey||event.ctrlKey||event.metaKey||event.code!=='KeyM')return;
   const running=document.querySelector<HTMLButtonElement>('.speech-controls[data-recording="true"] [data-voice-toggle]');
   if(running){event.preventDefault();running.click();return;}
   const element=document.activeElement;
   if(!isVoiceField(element))return;
   event.preventDefault();
   if(document.querySelector('.speech-controls[data-busy="true"]')){announce.current('Дождись окончания распознавания.');return;}
   rememberVoiceFocus(element);if(!element.id)element.id='dictation-field-'+(++fieldSequence);
   const button=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-voice-toggle]')).find(item=>item.getAttribute('aria-controls')===element.id);
   if(button){button.click();return;}
   setField(element);setRequested({id:element.id,nonce:performance.now()});
  };
  document.addEventListener('keydown',shortcut);
  const guardSubmit=(event:SubmitEvent)=>{if(event.target instanceof HTMLFormElement&&event.target.querySelector('[data-dictating="true"]')){event.preventDefault();event.stopPropagation();announce.current('Сначала останови запись.');}};
  document.addEventListener('submit',guardSubmit,true);
  return()=>{document.removeEventListener('focusin',focus);document.removeEventListener('keydown',shortcut);document.removeEventListener('submit',guardSubmit,true);};
 },[bootstrap.capabilities.speech]);
 useEffect(()=>{
  if(!field)return;
  field.dataset.voiceReady='true';
  const update=()=>{
   if(!field.isConnected){setField(null);return;}
   const rect=field.getBoundingClientRect();const dialog=field.closest<HTMLElement>('[role="dialog"]');const origin=dialog?.getBoundingClientRect();
   const visible=rect.bottom>Math.max(0,origin?.top??0)&&rect.top<Math.min(innerHeight,origin?.bottom??innerHeight);
   const shell=field.closest('.app-shell');const scale=shell?Number(getComputedStyle(shell).zoom)||1:1;
   const tokens=getComputedStyle(document.documentElement);const size=parseFloat(tokens.getPropertyValue('--control-size'))*scale;const gap=parseFloat(tokens.getPropertyValue('--space-1'))*scale;
   const inset=Math.max(0,Math.min(gap,(rect.height-size)/2));
   const left=Math.max(gap,Math.min(rect.right-size-gap,innerWidth-size-gap))-(origin?.left??0);
   const top=Math.max(origin?.top??0,Math.min(rect.top+inset,(origin?.bottom??innerHeight)-size-gap))-(origin?.top??0);
   const next={left,top:visible||active.current?top:-1000,inDialog:Boolean(dialog),scale};
   setPosition(old=>old.left===next.left&&old.top===next.top&&old.inDialog===next.inDialog&&old.scale===next.scale?old:next);
  };
  let frame=0;const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});};
  update();document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);observer.observe(field);
  const mutations=new MutationObserver(()=>{if(!field.isConnected)setField(null);});mutations.observe(document.body,{childList:true,subtree:true});
  return()=>{delete field.dataset.voiceReady;cancelAnimationFrame(frame);document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);observer.disconnect();mutations.disconnect();};
 },[field]);
 if(!field||!bootstrap.capabilities.speech)return null;
 const container=field.closest<HTMLElement>('[role="dialog"]')||document.body;
 return createPortal(<div className="universal-dictation" style={{position:position.inDialog?'absolute':'fixed',left:position.left,top:position.top,transform:`scale(${position.scale})`}}><DeferredSpeechInput key={field.id} targetId={field.id} compact fieldLabel={voiceFieldLabel(field)} requestStart={requested?.id===field.id?requested.nonce:0} onActivity={value=>{active.current=value;}}/></div>,container);
}
