/**
 * The printed text of a calculation report: the style sheet, KaTeX equations (their symbolic constants) and markup
 * removed, entities decoded. Used to check what a reader sees.
 */
export function reportText(html:string){
 let out='',i=0;
 const body=html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<title>[\s\S]*?<\/title>/g,'');
 while(i<body.length){
  const k=body.indexOf('<span class="katex',i);
  if(k<0){out+=body.slice(i);break;}
  out+=body.slice(i,k)+' ';
  // Skip the equation: count nested spans to its closing tag.
  let depth=0,j=k;
  const tag=/<(\/?)span\b[^>]*>/g;tag.lastIndex=k;
  for(let m=tag.exec(body);m;m=tag.exec(body)){depth+=m[1]?-1:1;j=tag.lastIndex;if(depth===0)break;}
  i=j;
 }
 return out.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
}
/**
 * Numbers printed with three or more decimal places (dates, clause numbers and ids excluded). A value below 0.1 printed
 * to two or three significant figures (0.033 in, 0.0029 rad) is not over-precise: its decimals are its leading zeros.
 */
export function overPrecise(html:string){
 const text=reportText(html).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,' ');
 return [...text.matchAll(/(?<![\w.§-])\d[\d,]*\.\d{3,}(?!\w|\.\d)/g)].filter(m=>!/^0\.0+[1-9]\d{0,2}$/.test(m[0])).map(m=>text.slice(Math.max(0,m.index!-50),m.index!+m[0].length+15));
}
