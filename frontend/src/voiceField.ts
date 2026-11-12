export type VoiceField=HTMLInputElement|HTMLTextAreaElement;
const focusedFields=new WeakSet<VoiceField>();
let activeBinding:symbol|null=null;

export function isVoiceField(element:Element|null):element is VoiceField{
 if(!(element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement))return false;
 if(element.disabled||element.readOnly||element.closest('[data-dictation="off"]'))return false;
 if(element instanceof HTMLInputElement&&!['text','search'].includes(element.type))return false;
 if(['numeric','decimal','tel','email','url'].includes(element.inputMode))return false;
 if(element.getAttribute('spellcheck')==='false'||/password|secret|token|csrf|mapping|username|api.?key|email|e_mail|url|uri|one.?time.?code|recovery.?code/i.test(element.name+' '+element.id+' '+element.autocomplete))return false;
 return true;
}
export function rememberVoiceFocus(element:VoiceField){focusedFields.add(element);}
export function voiceFieldLabel(element:VoiceField){return (element.getAttribute('aria-label')||element.labels?.[0]?.textContent||element.placeholder||'Текст').replace(/\s+/g,' ').trim().slice(0,120);}

export function bindVoiceField(id:string){
 const element=document.getElementById(id);
 if(!isVoiceField(element))throw Error('Выбери доступное текстовое поле для диктовки.');
 if(activeBinding)throw Error('Сначала останови текущую диктовку.');
 const base=element.value;const start=focusedFields.has(element)?element.selectionStart??base.length:base.length;const end=focusedFields.has(element)?element.selectionEnd??start:start;
 let lastValue=base;let cursor=start;
 const oldBusy=element.getAttribute('aria-busy');
 const key=Symbol('dictation');
 const claim=()=>{
  if(activeBinding&&activeBinding!==key)throw Error('Сначала останови текущую диктовку.');
  if(!element.isConnected||element.value!==lastValue)throw Error('Поле изменилось. Проверь текст перед повторной записью.');
  activeBinding=key;element.readOnly=true;element.setAttribute('aria-busy','true');element.dataset.dictating='true';
 };
 claim();
 const release=(focus=false)=>{
  if(activeBinding&&activeBinding!==key)return;
  if(activeBinding===key)activeBinding=null;
  element.readOnly=false;delete element.dataset.dictating;
  if(oldBusy===null)element.removeAttribute('aria-busy');else element.setAttribute('aria-busy',oldBusy);
  const current=document.activeElement;
  const mayReturn=current===element||current===document.body||current instanceof HTMLElement&&current.dataset.voiceToggle==='true'&&current.getAttribute('aria-controls')===id;
  if(focus&&mayReturn&&element.isConnected){element.focus({preventScroll:true});element.setSelectionRange(cursor,cursor);}
 };
 return {
  claim,
  apply(text:string){
   if(!element.isConnected)throw Error('Поле закрыто. Запиши текст в открытой форме.');
   if(element.disabled||activeBinding&&activeBinding!==key)throw Error('Поле занято другим действием. Уточнение сохранено отдельно.');
   if(element.value!==lastValue)throw Error('Текст изменился в другом действии. Проверь поле перед повторной записью.');
   const prefix=base.slice(0,start),suffix=base.slice(end);
   const left=prefix&&!/\s$/.test(prefix)&&text&&!/^[\s,.;:!?)]/.test(text)?' ':'';
   const right=suffix&&text&&!/^\s/.test(suffix)&&!/[\s(]$/.test(text)?' ':'';
   const value=prefix+left+text+right+suffix;
   const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(element,value);
   element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
   lastValue=value;cursor=(prefix+left+text).length;
   return element.maxLength>0&&value.length>element.maxLength;
  },
  release,
 };
}
