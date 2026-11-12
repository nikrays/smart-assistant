import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { api, queryClient, readableError } from './api';
import { Button, ErrorBox, HelpHint } from './ui';
import { bindVoiceField } from './voiceField';
import { submitSpeech, waitForSpeech } from './SpeechHistory';
import type { Session } from './types';

function previewWav(chunks:Float32Array[], sampleRate:number){
 const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
 const buffer=new ArrayBuffer(44+length*2);const view=new DataView(buffer);
 const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
 let offset=44;for(const chunk of chunks)for(const value of chunk){const sample=Math.max(-1,Math.min(1,value));view.setInt16(offset,Math.round(sample*(sample<0?32768:32767)),true);offset+=2;}
 return new Blob([buffer],{type:'audio/wav'});
}

export type SpeechInputProps=({targetId:string;onText?:(text:string)=>void}|{targetId?:undefined;onText:(text:string)=>void})&{compact?:boolean;fieldLabel?:string;onActivity?:(active:boolean)=>void;requestStart?:number};
export function SpeechInput({onText,targetId,compact=false,fieldLabel='Текст',onActivity,requestStart=0}:SpeechInputProps){
 const recorder=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);const context=useRef<AudioContext|null>(null);const capture=useRef<AudioWorkletNode|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const generation=useRef(0);const mounted=useRef(true);const starting=useRef(false);
 const pending=useRef<Promise<void>|null>(null);const request=useRef<AbortController|null>(null);const savedAudio=useRef<Blob|null>(null);
 const captureOwner=useRef<number|null>(null);
 const captureKey=useRef('');
 const [recording,setRecording]=useState(false);const [busy,setBusy]=useState(false);const [status,setStatus]=useState('');const [error,setError]=useState('');
 const binding=useRef<ReturnType<typeof bindVoiceField>|null>(null);
 const alive=(id:number)=>mounted.current&&generation.current===id;
 const releaseAudio=()=>{if(timer.current)clearTimeout(timer.current);capture.current?.disconnect();capture.current=null;void context.current?.close().catch(()=>{});context.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;starting.current=false;generation.current++;request.current?.abort();if(recorder.current?.state!=='inactive')recorder.current?.stop();releaseAudio();binding.current?.release();onActivity?.(false);};},[]);
 const recognize=async(audio:Blob,partial:boolean)=>{
  if(audio.size>16*1024*1024)throw Error('Аудиофайл должен быть не больше 16 МБ.');
  const form=new FormData();form.append('file',audio,audio instanceof File?audio.name:audio.type==='audio/wav'?'preview.wav':'recording.webm');
  const controller=new AbortController();request.current=controller;
  return api<{text:string}>('/speech/transcribe'+(partial?'?partial=true':''),{method:'POST',body:form,signal:controller.signal});
 };
 const finish=async(audio:Blob,id:number)=>{
  const destination=binding.current;destination?.release(alive(id));if(alive(id))onActivity?.(false);
  savedAudio.current=audio;if(alive(id)){setBusy(true);setError('');setStatus('Сохраняем запись…');}
  try{
   const owner=captureOwner.current;if(!owner)throw Error('Войди в приложение, чтобы сохранить запись.');
   const job=await submitSpeech(audio,fieldLabel,owner,captureKey.current);savedAudio.current=null;
   if(alive(id)){setBusy(false);setStatus('Запись сохранена. Текст уточняется в фоне, поле можно редактировать.');}
   const result=await waitForSpeech(job,owner);if(!alive(id))return;
   if(result.status==='failed'){setError(result.error);setStatus('Уточнение прервалось. Подробности записи доступны в разделе «Черновики».');return;}
   try{const overLimit=destination?.apply(result.text);if(!destination)onText?.(result.text);setStatus(overLimit?'Текст длиннее лимита поля. Сократи его перед сохранением.':'Текст уточнён. Изменения можно сохранить.');}
   catch{setStatus('Уточнение сохранено в разделе «Черновики»: запись голоса. Твой текст не изменён.');}
  }
  catch(reason){if(alive(id)&&!(reason instanceof DOMException&&reason.name==='AbortError')){setError(readableError(reason));setStatus(savedAudio.current?'Звук пока только в этой вкладке. Повтори сохранение перед её закрытием.':'Запись сохранена на сервере. Результат будет в разделе «Черновики».');}}
  finally{if(alive(id)){setBusy(false);onActivity?.(false);}}
 };
 const stop=()=>{if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();};
 const start=async()=>{
  if(starting.current||recording||busy)return;starting.current=true;setBusy(true);onActivity?.(true);setError('');setStatus('Подключаем микрофон…');savedAudio.current=null;
  captureOwner.current=queryClient.getQueryData<Session|null>(['session'])?.user.id||null;
  captureKey.current=crypto.randomUUID();
  const id=++generation.current;
  try{
   binding.current=targetId?bindVoiceField(targetId):null;
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Запись недоступна в этом браузере. Можно загрузить аудиофайл.');
   const input=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1}});if(!alive(id)){input.getTracks().forEach(track=>track.stop());return;}stream.current=input;
   let live=false;
   try{
    const audioContext=new AudioContext({sampleRate:16000});context.current=audioContext;
    await audioContext.audioWorklet.addModule('/speech-capture.js');if(!alive(id)){releaseAudio();return;}
    const node=new AudioWorkletNode(audioContext,'speech-capture');capture.current=node;
    const source=audioContext.createMediaStreamSource(input);const mute=audioContext.createGain();mute.gain.value=0;source.connect(node).connect(mute).connect(audioContext.destination);await audioContext.resume();
    const chunks:Float32Array[]=[];let lastSent=0;let samples=0;
    node.port.onmessage=event=>{
     if(!alive(id)||recorder.current?.state!=='recording')return;
     chunks.push(event.data as Float32Array);samples+=event.data.length;
     if(samples/audioContext.sampleRate-lastSent<2||pending.current)return;
     lastSent=samples/audioContext.sampleRate;
     const audio=previewWav(chunks,audioContext.sampleRate);
     const work=recognize(audio,true).then(data=>{if(alive(id)&&recorder.current?.state==='recording'){if(data.text)binding.current?.apply(data.text);setStatus(data.text?'Идёт запись…':'Ждём речь…');}}).catch(()=>{if(alive(id)&&recorder.current?.state==='recording')setStatus('Идёт запись. Уточним текст после остановки.');}).finally(()=>{if(pending.current===work)pending.current=null;});
     pending.current=work;
    };
    live=true;
   }catch{capture.current?.disconnect();capture.current=null;void context.current?.close().catch(()=>{});context.current=null;}
   if(!alive(id)){releaseAudio();return;}
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
   const instance=new MediaRecorder(input,mime?{mimeType:mime}:undefined);recorder.current=instance;const chunks:BlobPart[]=[];
   instance.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   instance.onstop=()=>{releaseAudio();if(alive(id))setRecording(false);void finish(new Blob(chunks,{type:instance.mimeType||'audio/webm'}),id);};
   instance.onerror=()=>{if(alive(id))setError('Запись прервалась. Попробуем распознать сохранённый звук.');stop();};
   instance.start();setRecording(true);setBusy(false);setStatus(live?'Идёт запись. Первые слова появятся через несколько секунд.':'Идёт запись. Промежуточный текст недоступен в этом браузере; распознаем после остановки.');timer.current=setTimeout(stop,180000);
  }catch(reason){releaseAudio();binding.current?.release();if(alive(id)){setBusy(false);onActivity?.(false);setStatus('');setError(reason instanceof DOMException&&reason.name==='NotAllowedError'?'Нет доступа к микрофону. Разреши запись в браузере или загрузи аудиофайл.':readableError(reason));}}
  finally{starting.current=false;}
 };
 useEffect(()=>{if(requestStart>0)void start();},[requestStart]);
 return <div className={'speech-controls'+(compact?' speech-compact':'')} data-recording={recording} data-busy={busy}>
  <div className="actions"><span className="action-with-help"><Button className={compact?'icon-button':''} data-voice-toggle="true" aria-keyshortcuts="Alt+M" aria-controls={targetId} aria-pressed={recording} aria-label={compact?(recording?'Остановить запись':'Продиктовать в поле: '+fieldLabel):undefined} loading={busy} onClick={()=>recording?stop():void start()}>{recording?<Square size={17}/>:<Mic size={17}/>} {!compact?(recording?'Остановить запись':'Записать голос'):null}</Button>{!compact?<HelpHint label="Голосовой ввод">Пока идёт запись, текст появляется прямо в поле. После остановки его можно сразу редактировать и сохранять. Уточнение работает в фоне и не перезаписывает твои правки. Звук обрабатывается локально, до 3 минут и 16 МБ.</HelpHint>:null}</span>{!compact?<Button disabled={recording||busy} onClick={()=>fileInput.current?.click()}><Upload size={17}/>Загрузить аудио</Button>:null}<input ref={fileInput} type="file" accept="audio/ogg,audio/webm,audio/wav,audio/mpeg,audio/mp4,.ogg,.webm,.wav,.mp3,.m4a" hidden aria-label="Аудиофайл для распознавания" onChange={event=>{const file=event.target.files?.[0];if(file&&!recording&&!busy){try{captureOwner.current=queryClient.getQueryData<Session|null>(['session'])?.user.id||null;captureKey.current=crypto.randomUUID();binding.current=targetId?bindVoiceField(targetId):null;void finish(file,++generation.current);}catch(reason){setError(readableError(reason));}}event.target.value='';}}/></div>
  <div className="speech-feedback" data-active={Boolean(error||status&&(recording||busy||!compact))}><p className="speech-status" role="status">{status}</p>
  {error?<ErrorBox message={error}/>:null}{error&&savedAudio.current?<Button disabled={busy||recording} onClick={()=>{if(savedAudio.current)void finish(savedAudio.current,++generation.current);}}>Повторить сохранение</Button>:null}
  </div>
 </div>;
}
