import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1,refetchOnWindowFocus:false}}});
let csrfToken='';
export const setCsrf=(value:string)=>{csrfToken=value;};
export function clearBusinessCache(){queryClient.removeQueries({predicate:query=>query.queryKey[0]!=='session'&&query.queryKey[0]!=='public-config'});queryClient.getMutationCache().clear();}
function expireSession(){dispatchEvent(new Event('sa:drafts-clear'));clearBusinessCache();setCsrf('');queryClient.setQueryData(['session'],null);}
export class ApiError extends Error {constructor(public status:number,message:string,public fields:Record<string,string>={}){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const requestToken=csrfToken;
  const headers=new Headers(options.headers);
  if(options.body && !(options.body instanceof FormData))headers.set('Content-Type','application/json');
  if(options.method && !['GET','HEAD'].includes(options.method))headers.set('X-CSRF-Token',csrfToken);
  const response=await fetch('/api'+path,{...options,headers,credentials:'same-origin'});
  if(!response.ok){if(response.status===401&&path!=='/auth/login'&&requestToken===csrfToken)expireSession();const body=await response.json().catch(()=>({}));const detail=typeof body.detail==='string'?body.detail:Array.isArray(body.detail)?body.detail.map((e:{msg:string})=>e.msg).join('. '):'Не удалось выполнить запрос.';throw new ApiError(response.status,detail,body.fields||{});}
  if(response.status===204)return undefined as T;
  return response.json();
}
export const post=<T>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export async function downloadFile(path:string,filename:string){
 const requestToken=csrfToken;
 const response=await fetch('/api'+path,{credentials:'same-origin'});
 if(!response.ok){if(response.status===401&&requestToken===csrfToken)expireSession();const body=await response.json().catch(()=>({}));throw new ApiError(response.status,typeof body.detail==='string'?body.detail:'Не удалось скачать файл. Попробуй ещё раз.');}
 const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function refresh(){await queryClient.invalidateQueries({predicate:q=>q.queryKey[0]!=='session'});}
export function readableError(error:unknown){return error instanceof Error?error.message:'Что-то пошло не так. Попробуй ещё раз.';}
export function recordTitle(record:Record<string,unknown>){return String(record.title||record.name||(record.text?String(record.text).slice(0,110):'')||(record.work_date?'Рабочее время · '+dateText(record.work_date):'')||('Запись №'+record.id));}
export function dateText(value:unknown){if(!value)return 'Не указано';const text=String(value);const date=new Date(text.length===10?text+'T12:00:00+03:00':text);return Number.isNaN(date.getTime())?text:new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Moscow',...(text.includes('T')?{timeStyle:'short' as const}:{})}).format(date);}
export function dateTimeInput(value:string){
  if(!/(?:z|[+-]\d{2}:?\d{2})$/i.test(value))return value.slice(0,16);
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function overlapsMoscowDay(event:{start:string;end?:string},day:string){
  const start=Date.parse(event.start.length===10?event.start+'T00:00:00+03:00':event.start);
  const end=event.end?Date.parse(event.end.length===10?event.end+'T00:00:00+03:00':event.end):start;
  const dayStart=Date.parse(day+'T00:00:00+03:00');
  return start<dayStart+86400000&&(end>start?end>dayStart:start>=dayStart);
}
export function numberText(value:unknown,unit=''){if(value===null||value===undefined||value==='')return 'Не указано';const num=Number(value);return Number.isFinite(num)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(typeof value==='string'?value as `${number}`:typeof value==='bigint'?value:num)+(unit?' '+unit:''):String(value);}
export const money=(value:unknown)=>numberText(value,'₽');
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
