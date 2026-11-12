import { useLayoutEffect, useRef } from 'react';

export function useHorizontalReveal<T extends HTMLElement>(key:string,selector:string){
 const ref=useRef<T>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const reveal=(item:HTMLElement|null)=>{if(!item)return;const target=item.getBoundingClientRect(),frame=node.getBoundingClientRect();const scale=frame.width/node.offsetWidth||1;if(node.scrollWidth>node.clientWidth){if(target.left<frame.left)node.scrollLeft-=(frame.left-target.left)/scale;else if(target.right>frame.right)node.scrollLeft+=(target.right-frame.right)/scale;}if(node.scrollHeight>node.clientHeight){if(target.top<frame.top)node.scrollTop-=(frame.top-target.top)/scale;else if(target.bottom>frame.bottom)node.scrollTop+=(target.bottom-frame.bottom)/scale;}};
  const selected=()=>reveal(node.querySelector<HTMLElement>(selector));
  const focus=(event:FocusEvent)=>{if(event.target instanceof HTMLElement)reveal(event.target.closest<HTMLElement>('a,button'));};
  const observer=new ResizeObserver(selected);observer.observe(node);node.addEventListener('focusin',focus);selected();
  return()=>{observer.disconnect();node.removeEventListener('focusin',focus);};
 },[key,selector]);
 return ref;
}
