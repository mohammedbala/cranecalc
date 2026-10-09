"""Create the capped-design review from generated engine/source evidence."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/capped-demonstration'
s=json.loads((OUT/'snapshot.json').read_text())
cw=json.loads((OUT/'cw-source-comparison.json').read_text())
verification=json.loads((OUT/'verification.json').read_text())
assert s['eligible'] and all(c['status'] in ('pass','not-applicable') for c in s['checks'])
assert verification['testsPassed']==verification['testsTotal'] and verification['buildPassed']
INK=HexColor('#193d47');PALE=HexColor('#edf4f3');RULE=HexColor('#c4d3d5')
styles=getSampleStyleSheet()
for name,font,size,leading in [('TitleX','Helvetica-Bold',23,27),('H','Helvetica-Bold',16,20),('B','Helvetica',9.2,13),('S','Helvetica',8,11),('L','Helvetica-Bold',10,14),('C','Helvetica',8,10.5),('CH','Helvetica-Bold',8,10.5)]:
 styles.add(ParagraphStyle(name,fontName=font,fontSize=size,leading=leading,textColor=INK,spaceAfter=7))
def p(t,style='B',raw=False):return Paragraph(t if raw else escape(str(t)),styles[style])
def table(rows,widths):
 t=Table([[p(v,'CH' if i==0 else 'C') for v in row] for i,row in enumerate(rows)],colWidths=widths,repeatRows=1)
 t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,-1),.4,RULE),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
 return t
def footer(c,d):
 c.saveState();c.setFillColor(INK);c.setFont('Helvetica-Bold',8);c.drawString(48,758,'CRANECALC / CAPPED SECTION DESIGN');c.setFont('Helvetica',8);c.drawRightString(564,758,'08 OCT 2026');c.setStrokeColor(RULE);c.line(48,747,564,747);c.line(48,43,564,43);c.drawString(48,29,'Software verification / fictitious 2-ton example / model limits retained');c.drawRightString(564,29,str(d.page));c.restoreState()
def ck(k):return next(c for c in s['checks'] if c['id']==k)
def link(url,label):return f'<link href="{escape(url)}" color="#126783">{escape(label)}</link>'
checks=[('major','Major-axis flexure'),('vertical','Vertical crane deflection'),('rail-twist','Rail rotation'),('cap-weld-strength','Cap weld combined shear flow'),('cap-development','Full channel force development'),('cap-weld-fatigue','Cap weld throat fatigue')]
worst=max((ck(key) for key,_ in checks),key=lambda c:c['utilization'])
passes=sum(c['status']=='pass' for c in s['checks']);na=sum(c['status']=='not-applicable' for c in s['checks'])
story=[p('Capped section design is enabled','TitleX'),p('W24X84 + C15X33.9 / three 25-ft bays','H'),p(f'The separate 2-ton fictitious demonstration passes {passes} applicable checks; {na} are not applicable. It exports a calculation report, editable CAD linework, signed interface forces and three 11 x 17 drawing sheets. Revision: {s["revision"]}.'),table([
 ['Example input','Value','Example input','Value'],
 ['Support system','Three simple spans','Method / crane duty','LRFD / CMAA C'],
 ['Static loaded wheels','Two at 4.0 kip each','Wheel spacing','10 ft'],
 ['Static empty wheels','Two at 1.6 kip each','Side thrust per wheel','0.4 kip'],
 ['Cap attachment','5/16 continuous fillets, both sides','End development','5 ft at each end'],
 ['Cap / weld materials','A572 Grade 50 / E70 weld metal','Bearing contact','Full contact; no top holes'],
 ],[105,153,105,153]),Spacer(1,6),table([['Selected limit state','D/C','Status'],*[[label,f'{ck(key)["utilization"]:.3f}',ck(key)['status'].upper()] for key,label in checks]],[348,84,84]),p(f'Highest utilization among the six checks above: {worst["title"]}, D/C = {worst["utilization"]:.3f}. Repeated fatigue-point checks are counted individually; passing check count is not a count of independent limit states.','S'),p('This is a new example, not a replacement for the original 10-ton crane','L'),p('The original bare W24X229 demonstration remains available. The new crane loads are one-fifth of that sample; its lighter section does not establish a lighter solution for the original loading. The current work implements the capped calculation branch, not a section-optimization study.'),p('Supported boundary','L'),p('Centered catalogue W + inverted C/MC; continuous full-length contact and dual welds; compact elements; the channel and W top flange wholly above the neutral axis; unperforated top elements; CMAA A-D; bearing stiffeners CJP-welded to the W top flange. Partial caps, gaps, intermittent welds, CMAA E/F and other unsupported geometry remain gated. Building brackets, frames, anchors, foundations and building-mounted stops remain separate designs.','S'),PageBreak()]

story += [p('Checks behind the implementation','H'),p('The design uses transformed catalogue bending properties and an integrated open-section median-line model for shear center, warping and monosymmetry. It does not use the empirical research fit for design resistance. Fillets are omitted and J is the sum of catalogue component values, with no favorable overlap credit.'),table([
 ['Verification','Independent comparison / acceptance'],
 ['Elastic properties','Three DG7 Table A-1 assemblies: Ix, top lateral inertia, centroid and both section moduli within 0.5% of rounded published values.'],
 ['Sectorial integration','Unequal-flange I shear center and Cw match their analytical closed forms; translation invariance and dimensional scaling also pass.'],
 ['Warping shear recovery','Symmetric I coefficient h b^2 / 16 independently reproduced.'],
 ['Signed monosymmetric stability','Both constant-moment critical roots match the analytical sine-mode determinant within 0.02%.'],
 ['Axial stability','E4-3 flexural-torsional critical load with centroid offset matches the independent analytical value within 0.02%.'],
 ['Support equilibrium','Eccentric top/bottom springs balance total lateral force and torque about the calculated shear center.'],
 ['F5 and cap shear flow','W30X99 + C15X33.9: rt about 4.50 in, Lp about 119 in, F5 Lr about 407 in; 77.7-kip shear gives about 0.756 kip/in per cap weld.'],
 ['Attachment checks','Independent weld throat resistance, traction-flow addition, end-loaded weld reduction, full-force development and reversed Category F throat range.'],
 ['Full app branches','Three-bay LRFD simple case passes; ASD continuous case clears numerical/model export gates with signed support moments. Missing inputs, CMAA E/F and real weld failure remain visible.'],
 ],[136,380]),Spacer(1,7),p('Deliberately conservative resistance choices','L'),p('AISC F4 User Note permits the F5 branch. The app envelopes both compression directions, uses Cb = 1 and the lower steel grade, and credits no plastic reserve. F5 Lr is not replaced by the approximately 457-in F4 value in DG7 Table A-2. Separate top/bottom lateral capacities feed simultaneous H1 interaction; E4-3/E7 and F13 checks remain active.','S'),p('Weld strength combines vertical, lateral, warping, local rail and axial transfer. Fatigue includes automatic Category B weld-adjacent points and Category E cap ends, plus Category F throat shear and the existing rail-keeper checks. No beneficial local load sharing is assumed. Numerical convergence remains a 1% requirement.','S'),p(f'Final regression: {verification["testsPassed"]}/{verification["testsTotal"]} tests passed across {verification["testFiles"]} files; production build passed. The browser verified cap inputs, E/F blocking, LaTeX rendering, S-03 preview and the Generate output flow. The report API recomputes the input and verifies its calculation revision.','S'),PageBreak()]

story += [p('Published Cw differences remain visible','H'),p('Twelve values from Lue and Ellifritt (1993), Table 1, are compared below. The historical table and the present v16 median-line integration do not match exactly. No multiplier or catalogue-property adjustment has been introduced to force agreement.'),table([
 ['Section assembly','1993 table Cw','Integrated Cw','Difference'],
 *[[v['section'],f'{v["published"]:,.0f}',f'{v["integrated"]:,.1f}',f'{v["differencePercent"]:+.2f}%'] for v in cw]
 ],[214,108,108,86]),p('Cw values are in inches to the sixth power. These are twelve section-property comparisons from one technical paper, not twelve permit calculations.','S'),p('Interpretation and remaining limitation','L'),p('The integrated results are 7.09-10.89% lower. The original source does not give all plate coordinates needed to isolate differences due to historical section data, fillets, channel taper and median-line idealization. The exact cause is unresolved. Lower Cw alone does not prove that all recovered stresses are conservative. Closed-form tests verify the implemented idealization; the published discrepancy remains an engineering review item.'),p('Source basis','L'),p('AISC Design Guide 7, third edition (2019), sections 13.3 and 14.1, Examples 14.1.3/14.1.4, Tables A-1/A-2 and appended 2023 errata; user-supplied original. Reference AIST Technical Report 13, supplied source dated February 24, 2020. AISC 360-16: F4/F5, E3/E4/E7, F13, H1/H3, J2/J4 and Appendix 3.','S'),p(link('https://ej.aisc.org/index.php/engj/article/view/699','Ellifritt and Lue (1998), Design of Crane Runway Beam with Channel Cap')+' - basic critical-moment equations; empirical fit retained as research only.','S',True),p(link('https://ej.aisc.org/index.php/engj/article/view/604','Lue and Ellifritt (1993), The Warping Constant for the W-Section with a Channel Cap')+' - Engineering Journal 30(1), pp.31-33; original Table 1 on p.32 visually verified.','S',True),p('Source hashes, model assumptions and reproduction steps are retained in the project reference register. The review PDF documents software evidence and limits; it does not certify the excluded supporting structure or substitute for a project-specific engineered design.','S')]

out=ROOT/'output/pdf/crane-runway-capped-design-validation.pdf'
SimpleDocTemplate(str(out),pagesize=(612,792),leftMargin=48,rightMargin=48,topMargin=62,bottomMargin=58,title='CraneCalc - capped section design verification',author='CraneCalc review').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
