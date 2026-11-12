import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api';
import App from './App';
import { ErrorBox } from './ui';
import { staticDemo } from './runtimeMode';
import './style.css';
const root=createRoot(document.getElementById('root')!);
async function start(){
 let Notice:ComponentType|null=null;
 if(staticDemo){const [demo,notice]=await Promise.all([import('./pagesDemo'),import('./PagesDemoNotice')]);await demo.installPagesDemo();Notice=notice.PagesDemoNotice;}
 root.render(<StrictMode><QueryClientProvider client={queryClient}>{Notice?<Notice/>:null}<App/></QueryClientProvider></StrictMode>);
}
void start().catch(()=>root.render(<div className="boot-screen"><ErrorBox message="Не удалось открыть демонстрацию. Разреши хранение данных для сайта и обнови страницу." retry={()=>location.reload()}/></div>));
