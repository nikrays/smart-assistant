import { useId, useRef, useState } from 'react';
import { BookOpen, Compass, HelpCircle, Play, Route } from 'lucide-react';
import { Button } from './ui';
import type { GuideProgress } from './types';
import './guidance.css';

export function HelpMenu({title,progress,onHelp,onStart,onResume}:{title:string;progress?:GuideProgress|null;onHelp:()=>void;onStart:(mode:GuideProgress['mode'])=>void;onResume:()=>void}){
 const id=useId();const ref=useRef<HTMLDivElement>(null);const [opened,setOpened]=useState(false);
 const act=(action:()=>void)=>{ref.current?.hidePopover();action();};
 return <><Button className="icon-button help-menu-trigger" aria-label={'Помощь по разделу: '+title} aria-haspopup="dialog" aria-expanded={opened} popoverTarget={id}><HelpCircle aria-hidden/></Button><div ref={ref} id={id} popover="auto" className="help-menu-popover" role="dialog" aria-labelledby={id+'-title'} onToggle={event=>{const next=(event.nativeEvent as ToggleEvent).newState==='open';setOpened(next);if(next)ref.current?.querySelector('button')?.focus();}}><h2 id={id+'-title'}>Чем помочь?</h2><p className="help-menu-context">{title}</p><div className="help-menu-actions"><Button onClick={()=>act(onHelp)}><BookOpen aria-hidden/>Открыть помощь</Button><Button onClick={()=>act(()=>onStart('section'))}><Route aria-hidden/>Тур по этому разделу</Button><Button onClick={()=>act(()=>onStart('overview'))}><Compass aria-hidden/>Тур с самого начала</Button>{progress&&progress.status!=='completed'?<Button onClick={()=>act(onResume)}><Play aria-hidden/>Продолжить тур</Button>:null}</div></div></>;
}
