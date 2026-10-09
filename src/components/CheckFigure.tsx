import type {ProjectInput} from '../engine/types';
import {checkFigureHtml} from './checkFigures';

export function CheckFigure({topic,project}:{topic:string;project?:ProjectInput}){
 return <div className="check-figure-wrap" dangerouslySetInnerHTML={{__html:checkFigureHtml(topic,project)}}/>;
}
