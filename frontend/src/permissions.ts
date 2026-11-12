import type { Session } from './types';

export function canRead(session:Session,resource:string){const grant=session.permissions[resource];return grant==='read'||grant==='write';}
export function canWrite(session:Session,resource:string){return session.permissions[resource]==='write';}

const routes:Record<string,string>={personal:'tasks',journal:'worklogs',maintenance:'maintenance_rules','field-scheme':'assets',calendar:'events',tasks:'tasks',people:'people',farm:'assets',stock:'stock',projects:'projects',calculations:'calculations','saved-calculations':'calculations',documents:'documents',worklogs:'worklogs',timesheets:'timesheets',assets:'assets',notes:'notes',experiments:'experiments'};
export function canVisit(session:Session,route:string){
 const page=route.replace(/^#/,'');
 if(['help','drafts','favorites','account','settings/account','settings'].includes(page))return true;
 if(page.startsWith('settings/')||['integrations','reports','start'].includes(page))return session.user.role==='admin';
 if(page==='today')return true;
 if(page==='assistant')return session.user.role==='admin';
 if(page==='personal'||page==='journal'||page==='maintenance'||page==='field-scheme')return session.user.role==='admin';
 return canRead(session,routes[page]||page);
}
