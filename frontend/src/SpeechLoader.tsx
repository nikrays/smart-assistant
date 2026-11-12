import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button, ErrorBox, Loading } from './ui';
import type { SpeechInputProps } from './SpeechInput';

class SpeechBoundary extends Component<{children:ReactNode;compact?:boolean;retry:()=>void;onError:()=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onError();}
 render(){
  if(!this.state.failed)return this.props.children;
  return this.props.compact?<Button className="icon-button" aria-label="Голосовой ввод не загрузился. Повторить загрузку" onClick={this.props.retry}><MicOff size={17} aria-hidden/></Button>:<ErrorBox message="Не удалось загрузить голосовой ввод. Текстовую форму можно продолжать." retry={this.props.retry}/>;
 }
}

export function DeferredSpeechInput(props:SpeechInputProps){
 const [attempt,setAttempt]=useState(0);const failed=useRef(false);
 const Input=useMemo(()=>lazy(()=>import('./SpeechInput').then(module=>({default:module.SpeechInput}))),[attempt]);
 const retry=()=>{failed.current=false;setAttempt(value=>value+1);};
 useEffect(()=>{const online=()=>{if(failed.current)retry();};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[]);
 return <SpeechBoundary key={attempt} compact={props.compact} retry={retry} onError={()=>{failed.current=true;}}><Suspense fallback={props.compact?<Button className="icon-button" disabled aria-label="Голосовой ввод загружается"><Mic size={17} aria-hidden/></Button>:<Loading/>}><Input {...props} requestStart={attempt===0?props.requestStart:0}/></Suspense></SpeechBoundary>;
}
