import {useState} from 'react';
import {X} from 'lucide-react';
import {fonts,standardDimStyle,standardTextStyle,type ArrowKind,type DimStyle,type TextStyle} from './annotation';
import {parseLength,type CadDoc} from './model';
import type {Meta} from './store';

const fmt=(v:number)=>String(Number(v.toFixed(5)));
/** A number field that commits on blur or Enter (lengths take feet-inches and fractions). */
function Num({label,value,onCommit,min=0}:{label:string;value:number;onCommit:(v:number)=>void;min?:number}){
 const [text,setText]=useState(fmt(value));const [last,setLast]=useState(value);
 if(last!==value){setLast(value);setText(fmt(value));}
 const commit=()=>{const v=parseLength(text);if(v!==undefined&&v>=min&&Math.abs(v-value)>1e-12)onCommit(v);else setText(fmt(value));};
 return <label>{label}<input value={text} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();}}/></label>;
}
/** STYLE and DIMSTYLE: the drawing's text and dimension styles, with Standard always present. */
export function StylesDialog({kind,doc,vars,onClose,onChange,onCurrent,onApplyDims}:{kind:'text'|'dim';doc:CadDoc;vars:Record<string,number|string|boolean>;onClose:()=>void;
 onChange:(meta:Meta,label:string)=>void;onCurrent:(kind:'text'|'dim',name:string)=>void;onApplyDims:(name:string)=>void}){
 const texts:TextStyle[]=doc.textStyles?.some(s=>s.name==='Standard')?doc.textStyles:[standardTextStyle,...(doc.textStyles??[])];
 const dims:DimStyle[]=doc.dimStyles?.some(s=>s.name==='Standard')?doc.dimStyles:[standardDimStyle(doc.unit),...(doc.dimStyles??[])];
 const current=String(vars[kind==='text'?'TEXTSTYLE':'DIMSTYLE']??'Standard');
 const [sel,setSel]=useState(current);
 const list=kind==='text'?texts:dims,style=list.find(s=>s.name===sel)??list[0];
 const inUse=(name:string)=>doc.entities.some(e=>('style' in e)&&e.style===name);
 const newName=()=>{let i=1;while(list.some(s=>s.name===`Style ${i}`))i++;return `Style ${i}`;};
 const putText=(next:TextStyle[],label:string)=>onChange({textStyles:next},label),putDim=(next:DimStyle[],label:string)=>onChange({dimStyles:next},label);
 const editText=(patch:Partial<TextStyle>)=>putText(texts.map(s=>s.name===style.name?{...s,...patch}:s),'Text style');
 const editDim=(patch:Partial<DimStyle>)=>putDim(dims.map(s=>s.name===style.name?{...s,...patch}:s),'Dimension style');
 const add=()=>{const name=newName();if(kind==='text')putText([...texts,{...(style as TextStyle),name}],'New text style');else putDim([...dims,{...(style as DimStyle),name}],'New dimension style');setSel(name);};
 const remove=()=>{if(style.name==='Standard'||inUse(style.name))return;if(kind==='text')putText(texts.filter(s=>s.name!==style.name),'Delete text style');else putDim(dims.filter(s=>s.name!==style.name),'Delete dimension style');setSel('Standard');};
 const rename=(name:string)=>{const n=name.trim();if(!n||style.name==='Standard'||list.some(s=>s.name===n))return;if(kind==='text')putText(texts.map(s=>s.name===style.name?{...s,name:n}:s),'Rename text style');else putDim(dims.map(s=>s.name===style.name?{...s,name:n}:s),'Rename dimension style');setSel(n);if(current===style.name)onCurrent(kind,n);};
 return <div className="cad-pop cad-styles" role="dialog" aria-label={kind==='text'?'Text styles':'Dimension styles'}>
  <h3>{kind==='text'?'Text styles':'Dimension styles'}<button aria-label="Close styles" onClick={onClose}><X size={12}/></button></h3>
  <div className="cad-style-list" role="listbox" aria-label="Styles">{list.map(s=><button key={s.name} role="option" aria-selected={s.name===style.name} className={s.name===style.name?'on':''} onClick={()=>setSel(s.name)}>{s.name}{s.name===current?' (current)':''}</button>)}</div>
  <div className="cad-pop-row"><button onClick={()=>onCurrent(kind,style.name)}>Set current</button><button onClick={add}>New</button><button disabled={style.name==='Standard'||inUse(style.name)} title={inUse(style.name)?'Objects use this style':undefined} onClick={remove}>Delete</button></div>
  {style.name!=='Standard'&&<label>Name<input defaultValue={style.name} key={style.name} onBlur={e=>rename(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename((e.target as HTMLInputElement).value);}}/></label>}
  {kind==='text'?(()=>{const t=style as TextStyle;return <>
   <label>Font<select value={t.font} onChange={e=>editText({font:e.target.value})}>{Object.keys(fonts).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
   <Num label="Height (0 asks)" value={t.height} onCommit={height=>editText({height})}/>
   <Num label="Width factor" value={t.widthFactor} min={.01} onCommit={widthFactor=>editText({widthFactor})}/>
   <Num label="Oblique angle" value={t.oblique} min={-85} onCommit={oblique=>editText({oblique:Math.max(-85,Math.min(85,oblique))})}/>
   <label className="cad-check"><input type="checkbox" checked={!!t.bold} onChange={e=>editText({bold:e.target.checked||undefined})}/>Bold</label>
  </>;})():(()=>{const d=style as DimStyle;return <>
   <Num label="Text height" value={d.textHeight} min={.0001} onCommit={textHeight=>editDim({textHeight})}/>
   <Num label="Arrow size" value={d.arrowSize} onCommit={arrowSize=>editDim({arrowSize})}/>
   <label>Arrowheads<select value={d.arrow} onChange={e=>editDim({arrow:e.target.value as ArrowKind})}>{(['closed','open','tick','dot','none'] as const).map(a=><option key={a} value={a}>{({closed:'Closed filled',open:'Open',tick:'Architectural tick',dot:'Dot',none:'None'})[a]}</option>)}</select></label>
   <Num label="Extension offset" value={d.extOffset} onCommit={extOffset=>editDim({extOffset})}/>
   <Num label="Extend beyond" value={d.extBeyond} onCommit={extBeyond=>editDim({extBeyond})}/>
   <Num label="Text gap" value={d.textGap} onCommit={textGap=>editDim({textGap})}/>
   <label>Text<select value={d.textPos} onChange={e=>editDim({textPos:e.target.value as DimStyle['textPos']})}><option value="above">Above the line</option><option value="centered">Centered in the line</option></select></label>
   {doc.display==='US'&&<label>Units<select value={d.units} onChange={e=>editDim({units:e.target.value as DimStyle['units'],precision:e.target.value==='arch'?16:2})}><option value="arch">Feet-inches</option><option value="decimal">Decimal inches</option></select></label>}
   <label>Precision<select value={d.precision} onChange={e=>editDim({precision:+e.target.value})}>{(doc.display==='US'&&d.units==='arch'?[1,2,4,8,16,32,64]:[0,1,2,3,4]).map(p=><option key={p} value={p}>{doc.display==='US'&&d.units==='arch'?(p===1?'1"':`1/${p}"`):p===0?'0':`0.${'0'.repeat(p)}`}</option>)}</select></label>
   <Num label="Overall scale" value={d.scale} min={.0001} onCommit={scale=>editDim({scale})}/>
   <Num label="Baseline spacing" value={d.baseline} onCommit={baseline=>editDim({baseline})}/>
   <label>Text style<select value={d.textStyle??'Standard'} onChange={e=>editDim({textStyle:e.target.value==='Standard'?undefined:e.target.value})}>{texts.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
   <label>Prefix<input defaultValue={d.prefix??''} key={`p${d.name}`} onBlur={e=>editDim({prefix:e.target.value||undefined})}/></label>
   <label>Suffix<input defaultValue={d.suffix??''} key={`s${d.name}`} onBlur={e=>editDim({suffix:e.target.value||undefined})}/></label>
   <div className="cad-pop-row"><button onClick={()=>onApplyDims(d.name)}>Update existing dimensions</button></div>
  </>;})()}
 </div>;
}
