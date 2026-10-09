"""Review PDF from executed engine outputs and independent reconciliations."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor,white
ROOT=Path(__file__).resolve().parents[1]
D=json.loads((ROOT/'output/published-examples/results-reconciled.json').read_text())
OUT=ROOT/'output/pdf/crane-runway-additional-aisc-review.pdf'
INK=HexColor('#182f3e');MUTED=HexColor('#50636c');RULE=HexColor('#ccd5da');PALE=HexColor('#eef3f5');AMBER=HexColor('#fff0d8')
styles=getSampleStyleSheet()
for name,font,size,leading in [('Body','Helvetica',9,13),('Small','Helvetica',8,11),('TitleX','Helvetica-Bold',25,29),('HeadingX','Helvetica-Bold',16,20),('Label','Helvetica-Bold',10,14),('Cell','Helvetica',8,11),('Head','Helvetica-Bold',8,10)]:
 styles.add(ParagraphStyle(name,fontName=font,fontSize=size,leading=leading,textColor=INK,spaceAfter=6 if name not in ['Cell','Head'] else 0))
def p(text,style='Body',raw=False):return Paragraph(text if raw else escape(str(text)),styles[style])
def table(rows,widths,highlight=[]):
 t=Table([[p(v,'Head' if i==0 else 'Cell') for v in r] for i,r in enumerate(rows)],colWidths=widths,repeatRows=1,hAlign='LEFT')
 settings=[('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,-1),.4,RULE),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]
 settings += [('BACKGROUND',(0,i),(-1,i),AMBER) for i in highlight];t.setStyle(TableStyle(settings));return t
def footer(c,doc):
 c.saveState();c.setStrokeColor(RULE);c.line(48,746,564,746);c.line(48,43,564,43);c.setFillColor(MUTED);c.setFont('Helvetica-Bold',8);c.drawString(48,758,'CRANECALC / ADDITIONAL PUBLISHED CALCULATION CHECKS');c.setFont('Helvetica',8);c.drawRightString(564,758,'08 OCT 2026');c.drawString(48,29,'Component validation / not a complete project design approval');c.drawRightString(564,29,f'{doc.page}');c.restoreState()
def fmt(n):return f'{n:,.5f}'.rstrip('0').rstrip('.')
def source(c):
 return p(f'<link href="{D["source"]["url"]}#page={c["pdfPages"].split("-")[0]}" color="#17677b">AISC v15.1 Companion, Vol. 1</link> - Example {escape(c["example"])}; printed {c["pages"]}; PDF pages {c["pdfPages"]}.','Small',True)

story=[Spacer(1,12),p('12 additional AISC examples','TitleX'),p('Drawing revision and calculation comparison review','HeadingX'),Spacer(1,14),table([['New cases','Published values','Within tolerance','Differences retained'],['12','37','24','13']],[129]*4),Spacer(1,14),p('Twelve new published input sets were run through the same strength and beam functions used by the app. They cover columns, fully braced beams, lateral-torsional buckling, minor-axis bending, shear, welds and bolts.'),p('These examples come from one authoritative AISC publication. They are component calculations, not twelve new permit packages or twelve complete crane runway designs. Previously reviewed municipal and DG7 cases are excluded from this count.'),p('Findings','Label'),p('Six result differences follow explicit conservative app assumptions: Cb = 1.0 for beam buckling and no directional-strength increase for welds. Seven smaller differences follow intermediate rounding in the publication; independent US-unit substitutions reproduce the app values to better than 0.00001%. All thirteen original flags remain in the tables.'),p('Design consequences','Label'),p('The midspan-braced W18X50 in F.1-3 and the selected 16-in welds in J.2 do not meet the source demands under the app assumptions. Agreement with an equation is separate from design adequacy.'),p('Drawing revision','Label'),p('S-01 and S-02 use plain centered titles with printed scales beneath each view. Top-of-steel aligns with the flange; elevation member labels sit below the steel. Bolt spacing and edge distances appear as dimensions, and weld sizes sit left of the symbols. Reference shapes remain unsized. Sheet labels and page sizes are in the title blocks. Leader checks cover compatible catalogue shapes plus US/SI and both frame styles.'),p('Limits of this review','Label'),p('This added suite does not establish moving-crane load envelopes, AIST fatigue spectra, rail torsion, building capacity or site-specific permit completeness. Existing review findings remain separate. No strength formula or export gate was changed to obtain agreement.','Small'),PageBreak(),p('Case register','HeadingX')]
rows=[['Case / AISC example','Input set','Match / difference']]
for c in D['cases']:
 a=sum(r['status']=='MATCH' for r in c['rows']);b=len(c['rows'])-a
 rows.append([f'{c["id"]} / {c["example"]}',c['title'],f'{a} / {b}'])
story += [table(rows,[125,281,110]),Spacer(1,14),p('Comparison rules','Label'),p('Before running, the printed-value tolerance was set to the larger of 0.1% of the reference value or half its last printed increment. Required bolt counts must agree exactly. Signed difference is 100(app - reference)/reference. MATCH refers only to that numeric tolerance.'),p('AISC 360-16 is the common specification basis. The normal app AISC catalogue uses Database v16.0 values; this is recorded so catalogue precision is not confused with manual rounding. E.1D uses its explicitly printed area and radii in the shared compression primitive.','Small'),p('Source provenance','Label'),p(f'<link href="{D["source"]["landing"]}" color="#17677b">Official AISC 15th-edition companion download page</link>; retrieved 7 October 2026. Source PDF hash:','Small',True),p(D['source']['sha256'],'Small'),PageBreak()]
for c in D['cases']:
 story += [p(f'{c["id"]} / EXAMPLE {c["example"]}','Small'),p(c['title'],'HeadingX'),source(c),Spacer(1,8),p('Inputs reproduced','Label')]
 for line in c['inputs']:story.append(p(line))
 story += [Spacer(1,6),p('Published result versus app','Label')]
 rows=[['Quantity / unit','Published','App','Difference','Result']]
 for r in c['rows']:rows.append([f'{r["label"]} ({r["unit"]})',fmt(r['reference']),fmt(r['app']),f'{r["percentDifference"]:+.3f}%',r['status']])
 story += [table(rows,[190,72,82,70,102],[i+1 for i,r in enumerate(c['rows']) if r['status']=='DIFFERENCE']),Spacer(1,10),p('Coverage and interpretation','Label'),p(c['coverage'])]
 for note in c['notes']:story.append(p(note,'Small'))
 for r in D['roundingReconciliations']:
  if r['case']==c['id']:story.append(p(r['note'],'Small'))
 story += [p('Result locations: '+ '; '.join(dict.fromkeys(r['basis'] for r in c['rows']))+'.','Small'),PageBreak()]
story += [p('Independent rounding reconciliation','HeadingX'),p('The seven rows below remain DIFFERENCE against the printed result. Separately coded US-unit substitutions, using unrounded given inputs, agree with the app to within 0.00001% relative. These are diagnostic checks of the same cases and are not counted as additional published examples.')]
for i,r in enumerate(D['roundingReconciliations']):
 if i==4:story += [PageBreak(),p('Independent rounding reconciliation','HeadingX')]
 story += [KeepTogether([p(r['case']+' / '+r['label'],'Label'),p(r['equation'],'Small'),p(f'Independent = {fmt(r["independent"])} {r["unit"]}; app = {fmt(r["app"])} {r["unit"]}.','Small'),p(r['note'],'Small'),Spacer(1,10)])]
story += [Spacer(1,12),p('Reproduction','Label'),p('Run npm run review:published for the TypeScript comparisons. Run scripts/reconcilePublishedExamples.py and scripts/renderPublishedExamples.py with the bundled Python environment to reproduce this review. Full inputs, source locations, tolerances and results are retained in output/published-examples/.','Small'),p('The updated demonstration PDF is exported through the normal report service after recalculation. It retains its fictional-data designation, engineering checks, revision identifier and the two 11 x 17 drawing sheets.','Small')]
doc=SimpleDocTemplate(str(OUT),pagesize=(612,792),leftMargin=48,rightMargin=48,topMargin=63,bottomMargin=58,title='CraneCalc - 12 additional published AISC examples',author='CraneCalc verification')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
