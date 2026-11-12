import { useEffect, useState, type ComponentProps } from 'react';
import type { GuidedTour } from './Guidance';
import { Button, ErrorBox } from './ui';

export function TourLoader(props:ComponentProps<typeof GuidedTour>){
 const [Component,setComponent]=useState<typeof GuidedTour|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let disposed=false;void import('./Guidance').then(module=>{if(!disposed)setComponent(()=>module.GuidedTour);}).catch(()=>{if(!disposed)setFailed(true);});return()=>{disposed=true;};},[]);
 if(Component)return <Component {...props}/>;
 return <aside className="guide-feedback" aria-label="Загрузка тура">{failed?<><ErrorBox message="Не удалось открыть тур. Проверь соединение и обнови страницу. Продолжим с сохранённого шага."/><Button onClick={props.onRetry}>Обновить и продолжить</Button></>:<p role="status">Загружаем пояснения...</p>}<Button onClick={()=>props.onStop(false)}>Закрыть тур</Button></aside>;
}
