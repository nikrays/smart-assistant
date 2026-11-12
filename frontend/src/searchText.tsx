const fold=(text:string)=>text.toLocaleLowerCase('ru-RU').replaceAll('ё','е');
export function searchMatches(text:string,query:string){return query.trim().split(/\s+/).every(word=>fold(text).includes(fold(word)));}
export function firstSearchMatch(text:string,query:string){const value=fold(text);const hits=(fold(query).match(/[\p{L}\p{N}]+/gu)||[]).map(word=>value.indexOf(word)).filter(index=>index>=0);return hits.length?Math.min(...hits):0;}
export function MarkedText({text,query}:{text:string;query?:string}){
 if(!query?.trim())return <>{text}</>;
 const value=fold(text);const tokens=Array.from(new Set(fold(query).match(/[\p{L}\p{N}]+/gu)||[])).slice(0,12);const ranges:[number,number][]=[];
 for(const token of tokens){let start=value.indexOf(token),count=0;while(start>=0&&count++<32){ranges.push([start,start+token.length]);start=value.indexOf(token,start+token.length);}}
 ranges.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];
 for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
 const parts=[];let offset=0;for(const [start,end] of merged){parts.push(text.slice(offset,start));parts.push(<mark key={start} className="search-match">{text.slice(start,end)}</mark>);offset=end;}parts.push(text.slice(offset));
 return <>{parts}</>;
}
