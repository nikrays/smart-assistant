import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { api, dateText, post, queryClient, readableError } from './api';
import { Button, ErrorBox, HelpHint, Panel, useApp } from './ui';
import type { Session } from './types';

export type SpeechJob={id:string;status:'queued'|'running'|'complete'|'failed';context:{page?:string;label?:string};text:string;error:string;created_at:string;updated_at:string};
type History={items:SpeechJob[]};
const sameUser=(id:number)=>queryClient.getQueryData<Session|null>(['session'])?.user.id===id;
export async function submitSpeech(audio:Blob,label:string,owner:number,key:string){
 if(!sameUser(owner))throw new DOMException('Аккаунт изменился','AbortError');
 const form=new FormData();form.append('file',audio,audio instanceof File?audio.name:audio.type==='audio/wav'?'recording.wav':'recording.webm');
 form.append('context',JSON.stringify({page:location.hash.slice(1),label}));
 const job=await api<SpeechJob>('/speech/jobs',{method:'POST',body:form,headers:{'X-Speech-Owner':String(owner),'X-Speech-Key':key}});
 void queryClient.invalidateQueries({queryKey:['speech-jobs']});return job;
}
export async function waitForSpeech(job:SpeechJob,owner:number){
 let current=job;
 while(current.status==='queued'||current.status==='running'){
  await new Promise(resolve=>setTimeout(resolve,500));
  if(!sameUser(owner))throw new DOMException('Аккаунт изменился','AbortError');
  current=await api<SpeechJob>('/speech/jobs/'+job.id);
 }
 void queryClient.invalidateQueries({queryKey:['speech-jobs']});
 return current;
}

const labels={queued:'В очереди',running:'Уточняем текст',complete:'Готово',failed:'Нужно повторить'};
export function SpeechHistory(){
 const {session,notify}=useApp();
 const query=useQuery({queryKey:['speech-jobs',session.user.id],queryFn:()=>api<History>('/speech/jobs'),refetchInterval:query=>query.state.data?.items.some(item=>item.status==='queued'||item.status==='running')?1000:false});
 const remove=useMutation({mutationFn:(id:string)=>api('/speech/jobs/'+id,{method:'DELETE'}),onSuccess:()=>queryClient.invalidateQueries({queryKey:['speech-jobs']})});
 const retry=useMutation({mutationFn:(id:string)=>post('/speech/jobs/'+id+'/retry',{}),onSuccess:()=>queryClient.invalidateQueries({queryKey:['speech-jobs']})});
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);notify('Текст скопирован');}catch{notify('Не удалось скопировать. Выдели текст записи и скопируй вручную.');}};
 if(!query.data?.items.length&&!query.error)return null;
 return <Panel title="Записи голоса" action={<HelpHint label="Записи голоса">Запись, принятая сервером, уточняется и после закрытия вкладки. Готовый текст можно скопировать в нужную форму.</HelpHint>}>{query.error?<ErrorBox message={readableError(query.error)} retry={()=>void query.refetch()}/>:null}{remove.error||retry.error?<ErrorBox message={readableError(remove.error||retry.error)}/>:null}<div className="draft-list">{query.data?.items.map(job=><article className="draft-item" key={job.id}><div className="section-head"><h3>{job.context.label||'Голосовая запись'}</h3><span className="badge">{labels[job.status]}</span></div><p className="subtle">{dateText(job.created_at)}</p>{job.text?<p className="pre-line">{job.text}</p>:null}{job.error?<p role="alert">{job.error}</p>:null}<div className="actions">{job.text?<Button onClick={()=>void copy(job.text)}><Copy size={16} aria-hidden/>Скопировать текст</Button>:null}{job.status==='failed'?<Button loading={retry.isPending} onClick={()=>retry.mutate(job.id)}><RefreshCw size={16} aria-hidden/>Повторить</Button>:null}<Button loading={remove.isPending} onClick={()=>remove.mutate(job.id)}><Trash2 size={16} aria-hidden/>Удалить запись</Button></div></article>)}</div></Panel>;
}
