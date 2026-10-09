"""Render the 12-case review and the package gap assessment from executed results.
Run with the bundled Python; matplotlib may be installed in tmp/review-python.
"""
import os,sys,json,math,hashlib
from pathlib import Path
from xml.sax.saxutils import escape
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/review-python'))
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'tmp/runway-review/mpl'))
import matplotlib
matplotlib.use('Agg')
from matplotlib.mathtext import math_to_image
from matplotlib.font_manager import FontProperties
from PIL import Image as PILImage
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,Image,KeepTogether,Flowable
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor,Color,white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader,PdfWriter

OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
TMP=ROOT/'tmp/runway-review';TMP.mkdir(parents=True,exist_ok=True)
DATA=json.loads((ROOT/'output/runway-review/review-results.json').read_text())
INK=HexColor('#203A45');TEAL=HexColor('#167D8D');MUTED=HexColor('#57707B');PALE=HexColor('#EEF5F6');RULE=HexColor('#D5E2E5');AMBER=HexColor('#9B5A13');AMBER_BG=HexColor('#FFF3DD');GREEN=HexColor('#276847');RED=HexColor('#9F3D32')
W=504;PAGE=(612,792)
styles=getSampleStyleSheet()
for name,font,size,lead,color in [('Body','Helvetica',9.4,13.5,INK),('Small','Helvetica',8,11,MUTED),('Tiny','Helvetica',7.2,9.5,MUTED),('Title2','Helvetica-Bold',25,29,INK),('H1x','Helvetica-Bold',17,21,INK),('H2x','Helvetica-Bold',11,15,TEAL),('Cell','Helvetica',8.2,11,INK),('Head','Helvetica-Bold',8,10,white)]:
 styles.add(ParagraphStyle(name,fontName=font,fontSize=size,leading=lead,textColor=color,spaceAfter=7 if name not in ('Cell','Head') else 0))

def clean(s):
 return str(s).replace('\u2011','-').replace('\u2013','-').replace('\u2014','-').replace('\u00d7',' x ').replace('\u2019',"'").replace('\u2018',"'").replace('\u2022','-')
def p(s,style='Body',raw=False):return Paragraph(clean(s) if raw else escape(clean(s)),styles[style])
def h(s):return p(s,'H2x')
def fmt(v):
 if abs(v)<1e-8:return '0'
 if abs(v)>=100000:return f'{v:,.1f}'
 return f'{v:,.5f}'.rstrip('0').rstrip('.')
def table(rows,widths,header=True):
 cooked=[[p(x,'Head' if header and i==0 else 'Cell') for x in row] for i,row in enumerate(rows)]
 t=Table(cooked,colWidths=widths,repeatRows=1 if header else 0,hAlign='LEFT')
 ts=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,-1),.4,RULE)]
 if header:ts += [('BACKGROUND',(0,0),(-1,0),INK)]
 for i in range(1 if header else 0,len(rows)):
  if i%2==0:ts += [('BACKGROUND',(0,i),(-1,i),PALE)]
 t.setStyle(TableStyle(ts));return t

def notice(title,text):
 t=Table([[p(title,'H2x'),p(text,'Small')]],colWidths=[127,W-127]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),AMBER_BG),('VALIGN',(0,0),(-1,-1),'TOP'),('BOX',(0,0),(-1,-1),.5,RULE),('LEFTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),7)]));return t

def footer(canvas,doc):
 canvas.saveState();canvas.setStrokeColor(RULE);canvas.line(54,747,558,747);canvas.setFont('Helvetica-Bold',8);canvas.setFillColor(TEAL);canvas.drawString(54,758,'CRANECALC  /  ENGINEERING SOFTWARE REVIEW');canvas.setFillColor(MUTED);canvas.setFont('Helvetica',7.5);canvas.drawRightString(558,758,'07 OCT 2026');canvas.line(54,44,558,44);canvas.drawString(54,31,'Benchmark review - not a project design approval');canvas.drawRightString(558,31,str(doc.page));canvas.restoreState()
def build(path,story,title):
 doc=SimpleDocTemplate(str(path),pagesize=PAGE,leftMargin=54,rightMargin=54,topMargin=62,bottomMargin=60,title=title,author='CraneCalc verification',pageCompression=1)
 doc.build(story,onFirstPage=footer,onLaterPages=footer)

class BeamSketch(Flowable):
 def __init__(self,spec):self.spec=spec;self.width=W;self.height=155
 def draw(self):
  c=self.canv;spans=self.spec['spans'];L=sum(spans);x0=25;x1=W-25;y=61;scale=(x1-x0)/L
  c.setFillColor(PALE);c.roundRect(0,0,W,self.height,5,fill=1,stroke=0);c.setStrokeColor(INK);c.setLineWidth(1.4);c.line(x0,y,x1,y)
  c.setLineWidth(.5);c.setDash(4,3);c.line(x0,y+4,x1,y+4);c.setDash()
  stations=[0]
  for length in spans:stations.append(stations[-1]+length)
  for j,s in enumerate(stations):
   x=x0+s*scale;path=c.beginPath();path.moveTo(x,y-1);path.lineTo(x-6,y-12);path.lineTo(x+6,y-12);path.close();c.drawPath(path,fill=0,stroke=1);c.line(x-10,y-15,x+10,y-15);c.setFont('Helvetica',7);c.drawCentredString(x,y-25,f'S{j+1}')
  c.setFont('Helvetica',7.5);c.setFillColor(INK)
  for a,b in zip(stations,stations[1:]):
   xa=x0+a*scale;xb=x0+b*scale;c.line(xa,15,xb,15);c.line(xa,11,xa,19);c.line(xb,11,xb,19);c.drawCentredString((xa+xb)/2,21,f'{b-a:g} ft')
  q=self.spec.get('q',0)
  if q:
   c.setStrokeColor(MUTED);c.line(x0,96,x1,96)
   for i in range(21):
    x=x0+(x1-x0)*i/20;c.line(x,96,x,y+8);c.line(x,y+8,x-2,y+13);c.line(x,y+8,x+2,y+13)
   c.setFont('Helvetica',8);c.drawString(12,137,f'q = {q:.4g} kip/ft')
  for j,load in enumerate(self.spec['points']):
   x=x0+load['x']*scale;top=119+(j%2)*10;c.setStrokeColor(TEAL);c.setLineWidth(1.2);c.line(x,top-9,x,y+2);c.line(x,y+2,x-3,y+8);c.line(x,y+2,x+3,y+8);c.setFont('Helvetica-Bold',8);c.setFillColor(TEAL);c.drawCentredString(max(24,min(W-24,x)),top,fmt(load['p'])+' kip')
  c.setFillColor(MUTED);c.setFont('Helvetica',7);c.drawRightString(W-12,137,'CONTINUOUS' if self.spec['continuous'] else 'SIMPLE SUPPORTS')

class EnvelopePlot(Flowable):
 def __init__(self,snapshot):self.s=snapshot;self.width=W;self.height=118
 def draw(self):
  c=self.canv;rows=self.s['analysis']['envelope'];length=sum(self.s['input']['spans']);peak=max(abs(r[k]) for r in rows for k in ['momentMax','momentMin']) or 1
  x0=30;x1=W-12;y0=45;scale=38/peak;c.setStrokeColor(RULE);c.line(x0,y0,x1,y0)
  for key,col in [('momentMax',TEAL),('momentMin',MUTED)]:
   c.setStrokeColor(col);c.setLineWidth(1.1);path=c.beginPath()
   for i,r in enumerate(rows):
    x=x0+r['x']/length*(x1-x0);y=y0+r[key]*scale
    if not i:path.moveTo(x,y)
    else:path.lineTo(x,y)
   c.drawPath(path)
  c.setFont('Helvetica',7.5);c.setFillColor(MUTED);c.drawString(30,98,'SUPPLIED-LOAD MOMENT ENVELOPE (not factored AIST design envelope)');c.drawString(30,6,'0 ft');c.drawRightString(x1,6,f'{length/304.8:g} ft');c.drawString(30,17,f'Envelope magnitude: {peak/(4448.221615*304.8):.3f} kip-ft')

def equation(expr,index):
 if index.startswith('11-1'):
  expr=r'\phi R_{n,c}=0.75(0.40)t_w^2 K\sqrt{EF_y t_f/t_w}'
 expr=expr.replace(r'\frac{qx(L-x)}2',r'\frac{qx(L-x)}{2}')
 dest=TMP/(index+'.png')
 math_to_image('$'+expr+'$',str(dest),prop=FontProperties(size=13),dpi=220,format='png',color='#203A45')
 with PILImage.open(dest) as im:width,height=im.size
 factor=min(72/220,(W-16)/width)
 return Image(str(dest),width=width*factor,height=height*factor,hAlign='LEFT')

source_map={x['id']:x for x in DATA['sources']}
story=[Spacer(1,20),p('12 runway benchmark cases','Title2'),p('Independent reference comparisons and actual app report exports','H1x'),Spacer(1,14),table([['Cases','Comparisons','Matched','Differences'],['12','78','72','6']],[126]*4),Spacer(1,18),p('This review exercises published runway examples, independent beam solutions, crane loading rules, local web checks, fatigue resistance and serviceability criteria. It uses the same calculation engine as the app.'),notice('Scope of evidence','Six cases execute full project calculations. Six isolate shared engine components or provision functions. Two eligible supplied-load analysis reports are appended directly from the local app export service. Complete code-design export remains blocked.'),Spacer(1,16),h('What the comparison labels mean'),p('MATCH means the numeric difference is within the stated tolerance for that row. DIFFERENCE means it is outside that tolerance; the reason is recorded. Neither label approves an actual runway, connection or supporting building.'),p('Default comparison tolerance: 0.1% relative, with 0.0000001 absolute allowance for numerical zero. Moving-envelope cases 04/05 use 0.25%; their independent reference travel-grid refinement uses 0.02%. Case 02 whole-section minor resistance uses 0.2% for its rounded published value. Exact combination factors use zero tolerance. Tolerances are saved per row in review-results.json.','Small'),h('Engineering adequacy is separate'),p('Case 05 matches the independent numerical solution but fails the entered vertical service criterion: 1.1348 in exceeds 0.8000 in (L/600). The original app PDF retains the failure.','Small'),h('Remaining differences'),p('Case 01: one rounded resistance and two conservative published moment sums. Case 02: a different loading/decomposition basis. Case 11: two unresolved permit local-web comparisons. All are retained; no app capacity or design-export gate was changed.'),p('Engine basis: '+DATA['referenceVersion']+'. Inputs, numeric results and API export evidence are saved alongside the review in output/runway-review/.','Small'),PageBreak(),p('Review map','H1x')]
index=[['Case','Check','Evidence / output']]
for c in DATA['cases']:
 dif=sum(r['status']=='DIFFERENCE' for r in c['rows']);index.append([c['id'],c['title'],f"{len(c['rows'])} comparisons; {dif} differences"])
story += [table(index,[34,316,154]),Spacer(1,12),h('How to reproduce'),p('Start the app with npm run dev, then run npm run review:runway. The command writes input JSON files, reference comparisons, the two server-generated analysis reports, and evidence that an incomplete design export is rejected. Run npm test for regression checks. The PDF renderer is scripts/renderRunwayReview.py.','Small'),p('The earlier twelve-permit suite is rerun separately: 50 comparisons, 36 matches and 14 differences. Its mixed crane/steel/timber-mechanics coverage is summarized after the new cases and is not counted as twelve additional runway designs.','Small'),PageBreak()]
for case in DATA['cases']:
 story += [p('CASE '+case['id']+' / INPUTS & REFERENCE','Small'),p(case['title'],'H1x'),p(case['purpose']),p(case['kind'],'Small'),table([['Parameter','Benchmark input']]+case['inputs'],[145,359]),Spacer(1,10),BeamSketch(case['diagram']),Spacer(1,5),p(case['diagram']['caption'],'Tiny'),h('Reference equations')]
 for j,eq in enumerate(case['equations']):story += [equation(eq,case['id']+'-'+str(j)),Spacer(1,9)]
 if case['id']=='11':story += [equation(r'K=1+(4l_b/d-0.2)(t_w/t_f)^{1.5}','11-k'),Spacer(1,8)]
 story += [h('Source locations')]
 for sid in case['sourceIds']:
  src=source_map[sid];story.append(p(f'<b>[{sid}]</b> <link href="{escape(src["url"])}" color="#167D8D">{escape(src["title"])}</link>. {escape(src["location"])}','Small',True))
 story += [PageBreak(),p('CASE '+case['id']+' / COMPARISON RESULTS','Small'),p(case['title'],'H1x')]
 rows=[['Quantity / unit','Reference','App','Error','Result']]
 for r in case['rows']:rows.append([r['label']+'\n('+r['unit']+')',fmt(r['reference']),fmt(r['app']),f"{100*r['relativeError']:.3f}%",r['status']])
 t=table(rows,[214,76,76,57,81]);
 for i,r in enumerate(case['rows'],1):
  if r['status']=='DIFFERENCE':t.setStyle(TableStyle([('BACKGROUND',(0,i),(-1,i),AMBER_BG)]))
 story += [t,Spacer(1,8)]
 for r in case['rows']:
  if r['status']=='DIFFERENCE':story.append(p(f"{r['label']}: {r['basis']}. {r['note']}",'Small'))
 if 'snapshot' in case:
  snap=case['snapshot'];a=snap['analysis'];numerical=all(x['status']=='pass' for x in snap['checks'] if x['group']=='Analysis')
  story += [p(f"App revision {snap['revision']}. Numerical checks {'passed' if numerical else 'failed'}; {a['cases']:,} supplied-load cases; travel refinement {a['convergence']*100:.4f}%; spatial refinement {a['meshConvergence']*100:.4f}%; equilibrium residual {a['equilibriumError']:.2e}.",'Small')]
  if case['id'] in ('04','05'):
   for check in snap['checks']:
    if check['group']=='Serviceability':
     story.append(p(f"Engineering criterion - {check['title']}: {check['status'].upper()}; {check['demand']/25.4:.4f} in vs {check['capacity']/25.4:.4f} in; utilization {check['utilization']:.4f}.",'Small'))
   story += [EnvelopePlot(snap)]
  else:
   blockers=[x['title'] for x in snap['checks'] if x['status'] in ('incomplete','unsupported','unverified')]
   story.append(p('Design export: BLOCKED. '+ '; '.join(blockers)+'.','Small'))
 for note in case['notes']:story.append(p(note,'Small'))
 story += [PageBreak()]
story += [p('Earlier municipal permit comparisons','H1x'),p('The existing twelve-report permit suite was rerun. It contains 2 crane reports, 8 other steel reports and 2 timber reports used only for shared beam mechanics. These are isolated checks. Full source identities, page numbers, hashes, inputs and all 50 rows are in references/PERMIT_BENCHMARKS.md and benchmarks/permit-results.json.'),table([['Reports','Comparisons','Matched','Differences'],['12','50','36','14']],[126]*4),Spacer(1,12)]
rows=[['Permit report','Checks','Matched','Differences']]
for src in DATA['prior']['sources']:
 rr=[r for r in DATA['prior']['results'] if r['sourceId']==src['id']];rows.append([src['title'],str(len(rr)),str(sum(r['status']=='match' for r in rr)),str(sum(r['status']=='difference' for r in rr))])
story += [table(rows,[315,55,66,68]),Spacer(1,12),p('The prior differences include the same Everett checks, Zimmer rounded-radius and Cb effects, a lower Dish Cb=1 resistance, and nine source deflections about 0.26-0.81% above the bending-only replay. Their source analysis details remain insufficient to establish the cause. These earlier comparisons are not added to the new suite to inflate an independent-case count.','Small'),PageBreak(),p('Reproduction and app export evidence','H1x')]
for item in DATA['exports']:
 story.append(p(f"Case {item['id']}: HTTP {item['status']}; revision {item['revision']}; "+(f"{item['bytes']:,} PDF bytes, PDF signature and returned revision verified." if 'bytes' in item else 'Complete design rejected as expected. No export eligibility flag was overridden.')))
story += [h('Primary sources')]
for src in DATA['sources']:
 story += [p(f"[{src['id']}] {src['title']}",'H2x'),p(src['location'],'Small'),p(f'<link href="{escape(src["url"])}" color="#167D8D">{escape(src["url"])}</link>','Tiny',True)]
story += [h('Attached app reports'),p('The following pages are the PDFs returned by the normal app service for cases 04 and 05. They include inputs, worksheets, governing positions, CAD-style engineering sketches and revision identifiers. Their scope is supplied-load analysis. Original report page numbering is preserved; PDF bookmarks separate the reports.'),p('Authoritative full publications are not redistributed. Published values are small numeric extracts; new mechanics cases are independently chosen equation checks, not additional permit reports.','Small')]
base=TMP/'benchmark-review-body.pdf';build(base,story,'CraneCalc - twelve runway benchmark cases')
writer=PdfWriter();writer.append(str(base),outline_item='Twelve benchmark cases and comparisons')
reader=PdfReader(str(base))
for i,page in enumerate(reader.pages):
 text=page.extract_text() or ''
 for case in DATA['cases']:
  if 'CASE '+case['id']+' / INPUTS' in text:writer.add_outline_item('Case '+case['id']+' - '+case['title'],i)
for ident in ['04','05']:writer.append(str(TMP/f'app-case-{ident}.pdf'),outline_item=f'Case {ident} - original app analysis PDF')
writer.add_metadata({'/Title':'CraneCalc - twelve runway benchmark cases','/Author':'CraneCalc verification','/Subject':'78 reference comparisons; 72 match and 6 differences retained'})
with open(OUT/'crane-runway-validation-review.pdf','wb') as f:writer.write(f)

# Gap assessment: findings come from the current implementation, not from inference based on its 3D model.
gap=[Spacer(1,16),p('What a runway design package still needs','Title2'),p('Calculation and drawing coverage review','H1x'),p('The app provides useful girder calculations, moving-load diagrams and dimensioned sketches. The largest unfinished work is the actual transfer of crane forces through the rail, girder connections, brackets, building columns, anchors and foundations.'),notice('Current design status','Complete design export is still blocked by unresolved models. The detailed 3D prefab frame, bolts, nuts, washers and holes are representative geometry. They do not establish member, connection or foundation resistance.'),Spacer(1,18),h('Five priorities before a project design package'),table([['Priority','Required next deliverable'],['1 - Load path','Torsion/warping and rail-twist checks; load-height stability; actual brace stiffness and strength.'],['2 - Connections','Designed bearing seats, end restraints, tiebacks, longitudinal transfers, bearing stiffeners and rail attachments.'],['3 - Building','Existing PEMB frame, bracket, column, bracing, base/anchor and foundation verification using coordinated crane loads.'],['4 - Duty and loading','Manufacturer wheel schedules and load splits, crane duty spectrum, bumper/stop forces, travel limits and owner criteria.'],['5 - Construction information','Dimensioned plans/details, fabrication notes, tolerances, materials, bolt/weld schedules, erection sequence and inspection requirements.']],[100,404]),Spacer(1,12),p('This is an implementation-gap review and a proposed package outline. The project location, adopted codes, crane supplier documents, existing-building records and permit authority requirements have not been supplied, so a jurisdiction-specific submittal determination is still needed.','Small'),h('Basis'),p('Reference AIST Technical Report 13; DG7 Chapters 11-16 and 18; AISC 360-16; MBMA Common Industry Practices (2024 edition); OSHA 1910.179. Source locations and links are listed at the end.','Small'),PageBreak(),p('Calculation package - coverage and gaps','H1x')]
calc_rows=[['Topic','Current coverage','Needed for the package'],['Design basis and loads','US/SI, ASD/LRFD, wheel schedules and AIST runway projections.','Adopted editions/errata; manufacturer issued wheel loads and trolley positions; bridge/trolley/lift split; owner criteria; environmental and installation loads where applicable.'],['Girder strength','Compact symmetric I-section F2, G2, H1 and entered F13 net area.','Resolve torsion/warping, rail load height and actual restraint conditions. Cap channels, asymmetric/noncompact members need appropriate methods.'],['Local wheel/support effects','J10 screening; actual rail depth and support bearing input.','Grouped wheel bearing patches where overlapping; bearing/stiffener/weld design; rail-to-flange local behavior and attachment load transfer.'],['Fatigue','One selected girder material point and entered category/cycle count.','Detail-by-detail stress ranges at welds, attachments and splices; actual category geometry; duty spectrum and cycle accounting; local stress/warping effects.'],['Serviceability','Static crane deflection and independent lateral bending; class/owner limits.','Rail twist; differential runway deflection; column drift/spread; flexible-support effects; alignment under load; camber and survey targets.'],['Connections and bracing','Bolt pitch and direct weld-line screening; brace requirements.','Bolt groups, slip/bearing, plate bending/block shear, prying, eccentric welds, fatigue, connection flexibility and stiffness of the complete brace load path.'],['Building and foundations','Reference framing in the viewer; girder support reactions.','Coordinated column/bracket/frame analysis, anchors and base plates, footing/pedestal/geotechnical checks, uplift and load combinations.']]
gap += [table(calc_rows,[100,157,247]),Spacer(1,10),p('Finding: an attractive connection model cannot supply the missing design assumptions. Every connection detail must be linked to actual forces, material grades, geometry, boundary conditions and a completed check.','Small'),PageBreak(),p('Drawing package - proposed sheet index','H1x'),p('The app currently exports girder elevation, plan and section linework plus analysis diagrams. Use the following as a project sheet outline, with references between every detail and its calculation.'),table([['Sheet','Typical contents to add'],['S001 - Basis and notes','Code editions, design criteria, crane schedule, materials, load signs/units, scope of delegated design, general steel/bolt/weld notes and inspections.'],['S101 - Runway plan','Both runway lines; building grids; bay lengths; rail gauge; travel limits; crane approach distances; stops; bracing bays; tiebacks; expansion joints; adjacent obstructions.'],['S201 - Elevations/sections','Top-of-rail and seat elevations, column/bracket levels, headroom and side clearances, wheel/rail geometry, girder camber and continuity/splice locations.'],['S301 - Girder fabrication','Member/plate marks and sizes, stiffeners, cutouts, flange holes/net sections, splice plates, weld sizes/lengths/terminations, fatigue-sensitive details and material grades.'],['S401 - Supports and tiebacks','Seat/bearing/end restraint, column bracket and stiffeners, top/bottom lateral ties, rotation allowances, longitudinal force transfer and hold-down details.'],['S501 - Rail and stops','Rail type/weight, joints, clips/pads, fasteners, adjustable alignment, rail eccentricity, end stops/bumpers and support forces, electrification attachments.'],['S601 - Building/foundations','Actual existing/proposed frame and bracing modifications; bases/anchors; pedestal/footing details; load-transfer and responsibility interfaces.'],['S701 - Schedules and QA','Bolt assemblies and pretension/slip requirements, holes/tolerances, weld/NDT requirements, coatings, erection bracing, survey/acceptance and maintenance access.']],[130,374]),Spacer(1,12),p('The current DXF uses editable linework and exploded dimensions. Reference framing and connection templates are excluded from the engineering DXF. Associative CAD dimensions, fabrication-ready connection sheets, material/bolt takeoffs and a complete building drawing set are not generated.','Small'),p('OSHA 1910.179(b)(6) addresses crane-to-obstruction clearances; (e) addresses stops and bumpers. Include supplier geometry and operating envelopes rather than assuming the reference 3D crane establishes clearance compliance.','Small'),PageBreak(),p('Existing prefab building - information to obtain','H1x'),p('Because the runway bears from building-column brackets, the building must be checked for those forces and deformations. Its roof and wall appearance does not identify the actual structural capacities.'),table([['Obtain','Purpose'],['Original PEMB documents','Manufacturer job number, original sealed calculations/erection drawings, design loads, material grades, tapered web/flange dimensions, brace layout and connection details.'],['Field verification','Survey member sizes, elevations, alignment, splices, corrosion/damage, undocumented alterations, foundations and anchor condition. Reconcile records with actual construction.'],['Crane supplier submittal','Rated load, wheelbase and wheel loads for critical trolley positions, dynamic factors, duty class, side/traction/bumper forces, clearances, rail and clipping requirements.'],['Reaction interface','For each support and governing combination: vertical, transverse and longitudinal forces, moments/torsion, signs, units, load factors and simultaneous actions. Include uplift and service movements.'],['Foundation/site records','Anchor size/grade/embedment, pedestal/footing reinforcement, concrete strength, soil/geotechnical capacity, existing loads and any needed investigation.']],[141,363]),Spacer(1,12),h('Coordinate responsibility explicitly'),p('Identify who designs the runway, rails/stops, column brackets, frame modifications, anchors and foundations; who supplies interface loads; and who checks compatibility. MBMA Sections 3.1, 3.2.2 and 3.3.2 distinguish manufacturer and project-design responsibilities. Do not assume a metal-building supplier covers every crane component or foundation interface.','Small'),h('App improvement with high value'),p('Add a signed, simultaneous support-action export by load combination and case, suitable for the building engineer. The current report gives reactions for the case governing the largest absolute reaction; it does not provide the complete coordinated building/anchor design interface.','Small'),PageBreak(),p('Validation findings and practical next work','H1x'),p('The new suite has 12 cases and 78 comparisons: 72 matched; six are retained as differences. Both app analysis exports succeeded, and an incomplete full-design export was correctly rejected. Case 05 matches the independent solution but fails vertical serviceability: 1.1348 in exceeds the entered 0.8000 in limit.'),table([['Finding','Interpretation / action'],['DG7 ASD: 203 vs 203.3433 kip-ft','Whole-section minor resistance rounding. Preserve the separate single-flange resistance used by the app.'],['DG7 ASD: 478 vs 476.756; 386 vs 385.330 kip-ft','Guide adds independent maxima; app keeps loads concurrent. Independent concurrent equations agree.'],['DG7 LRFD: 690 vs 679.514 kip-ft','DG7 wheel decomposition/impact assumptions differ from the AIST replay. Resolve project load basis; do not interchange the values.'],['Everett: 187.91 vs 179.7613 kip','Local crippling difference remains unresolved with reconstructed material inputs and printed dimensions.'],['Everett: 102.86 vs 51.4304 kip','App applies the conservative end reduction; source load position and stiffener contribution need confirmation.'],['Prior permit suite','36/50 matched. Nine deflections remain about 0.26-0.81% above the bending-only replay; two Cb-related and one radius-rounding difference also remain.']],[196,308]),Spacer(1,13),h('Recommended implementation order'),p('1. Build complete torsion/load-height and connection/brace models, with independent published or equation-based checks for each new limit state.'),p('2. Add simultaneous support actions and a documented handoff to the actual building/foundation design. Extend fatigue from one material point to a linked detail register.'),p('3. Generate project-specific support, rail, stiffener and splice drawings from the verified geometry, with materials, welds, bolts, tolerances and calculation cross-references.'),p('Keep source comparison results, numerical convergence, model completeness and engineering adequacy as separate states. A passing regression test or a successful PDF export is not evidence that all four are satisfied.','Small'),PageBreak(),p('Sources and review boundaries','H1x')]
refs=[('AIST','Reference AIST Technical Report 13','Supplied source dated February 24, 2020; Chapters 3, 5 and 6. Exact source identity is retained in SOURCE_REGISTER.md.','https://www.aist.org/technology-committees/find-a-committee/cranes/tr-13-guide-files'),('DG7','AISC Design Guide 7, third edition (2019)','Supplied original, Chapters 11-16 and 18; February 2023 errata appended. Publisher overview linked here.','https://www.aisc.org/globalassets/modern-steel/archives/2019/aug2019.pdf'),('AISC','ANSI/AISC 360-16','F2, F13, G2, H1, J10, Appendix 3 and Appendix 6; exact pinned printing in the source register.','https://www.aisc.org/aisc/publications/historic-standards/specification-for-structural-steel-buildings/'),('MBMA','Common Industry Practices, 2024 edition','Sections 3.1, 3.2.2, 3.3.2 and 6.8; engineering data, responsibility boundaries and runway erection alignment.','https://mbma.com/sites/default/files/documents/MBMA%20Common%20Industry%20Practices%202024%20Edition_0.pdf'),('OSHA','29 CFR 1910.179 - Overhead and gantry cranes','Sections (b)(6), (e), (j), (k) and (l): clearances, stops/bumpers, inspection, testing and maintenance. Operating requirements are separate from structural resistance.','https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.179')]
for tag,title,location,url in refs:
 gap += [p(f'[{tag}] {title}','H2x'),p(location,'Small'),p(f'<link href="{escape(url)}" color="#167D8D">{escape(url)}</link>','Tiny',True)]
gap += [Spacer(1,10),h('Implementation evidence inspected'),p('README.md; references/AIST_CHECKS.md and SOURCE_REGISTER.md; src/engine/calculate.ts, aistChecks.ts, aiscStrength.ts and designAnalysis.ts; server/report.ts and index.ts; engineering drawing/export implementation. Audit date: October 7, 2026.','Small'),p('No full-design gate was disabled, no benchmark discrepancy was hidden and no source capacity was substituted for an unexplained app result. Project-specific permit content and required seals remain for the engineer of record and applicable authority to establish.','Small')]
build(OUT/'crane-runway-package-gap-review.pdf',gap,'CraneCalc - drawing and calculation package gaps')
for file in [OUT/'crane-runway-validation-review.pdf',OUT/'crane-runway-package-gap-review.pdf']:
 r=PdfReader(file);text='\n'.join(page.extract_text() or '' for page in r.pages)
 assert len(text)>4000
 print(file.name,len(r.pages),'pages',file.stat().st_size,'bytes',hashlib.sha256(file.read_bytes()).hexdigest())
