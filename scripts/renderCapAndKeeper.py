"""Review of keeper fatigue correction, capped elastic properties and sizing."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'output/cap-keeper-validation/evidence.json').read_text())
INK=HexColor('#193d47');PALE=HexColor('#edf4f3');RULE=HexColor('#c4d3d5')
styles=getSampleStyleSheet()
for name,font,size,leading in [('TitleX','Helvetica-Bold',23,27),('H','Helvetica-Bold',15,19),('B','Helvetica',9,12.5),('S','Helvetica',8,10.5),('L','Helvetica-Bold',10,14),('C','Helvetica',7.8,10),('CH','Helvetica-Bold',7.8,10)]:
 styles.add(ParagraphStyle(name,fontName=font,fontSize=size,leading=leading,textColor=INK,spaceAfter=7))
def p(t,style='B',raw=False):return Paragraph(t if raw else escape(str(t)),styles[style])
def table(rows,widths):
 t=Table([[p(v,'CH' if i==0 else 'C') for v in row] for i,row in enumerate(rows)],colWidths=widths,repeatRows=1)
 t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,-1),.4,RULE),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
 return t
def footer(c,d):
 c.saveState();c.setFillColor(INK);c.setFont('Helvetica-Bold',8);c.drawString(48,758,'CRANECALC / CAP & KEEPER VALIDATION');c.setFont('Helvetica',8);c.drawRightString(564,758,'08 OCT 2026');c.setStrokeColor(RULE);c.line(48,747,564,747);c.line(48,43,564,43);c.drawString(48,29,'Fictitious sample / limited cap assessment / actual permit comparison');c.drawRightString(564,29,str(d.page));c.restoreState()
def ck(t,k):return next(c for c in t['checks'] if c['id']==k)
def link(url,label):return f'<link href="{escape(url)}" color="#126783">{escape(label)}</link>'
selected=next(t for t in data['results'] if t['id']=='W24X229-brace25-ecc0.25')
story=[p('A lighter, checked sample','TitleX'),p('W24X229 replaces W24X250 in the demonstration.','H'),p('The keeper-fatigue correction permits an 8.4% reduction in nominal girder weight: 21 lb/ft, or 1,575 lb over the modeled 75-ft runway line. All 287 applicable checks pass; 6 are not applicable. The 25-ft restraint spacing, crane loads, eccentricity, rail and connection inputs, duty spectrum and owner criteria are unchanged. This is a checked W24 choice, not a catalogue-wide optimum.'),table([
 ['Selected check','Demand / limit','D/C'],
 ['Major-axis flexure',f'{ck(selected,"major")["demand"]/(4448.221615*304.8):.2f} / {ck(selected,"major")["capacity"]/(4448.221615*304.8):.2f} kip-ft',f'{ck(selected,"major")["utilization"]:.3f}'],
 ['Vertical crane deflection',f'{ck(selected,"vertical")["demand"]/25.4:.4f} / 0.5000 in',f'{ck(selected,"vertical")["utilization"]:.3f}'],
 ['Rail rotation',f'{ck(selected,"rail-twist")["demand"]:.6f} / 0.005000 rad',f'{ck(selected,"rail-twist")["utilization"]:.3f}'],
 ['Governing fatigue check',selected['fatigue'][0]['title'],f'{selected["fatigue"][0]["utilization"]:.3f}'],
 ],[157,274,85]),Spacer(1,9),p('Correction: separate fatigue loads from strength loads','L'),p('The prior keeper model reused the factored strength envelope for every fatigue bin. Reference AIST Technical Report 13 section 3.10.2.3 instead specifies unfactored Cds + Cvs + 0.5Css, without impact. Each duty bin now retains empty-crane weight and scales only the lifted portion. Strength demand is unchanged.'),table([
 ['Duty level','Cycles','Vertical group','Lateral group','W24X229 local flange range'],
 *[[b['name'],f'{b["cycles"]:,}',f'{b["vertical"]/4448.221615:.2f} kip',f'{b["lateral"]/4448.221615:.2f} kip',f'{2*b["flangeStress"]/6.894757293:.3f} ksi'] for b in data['fatigueComparison'][1]['bins']],
 ],[143,73,91,85,124]),Spacer(1,9),p('Local load transfer is still a conservative model: the full wheel group acts on the keeper, side thrust reverses, and the full local reversed range is added to global bending/warping extrema. Every bin contributes to damage; the largest combined range also applies to all cycles. No sharing, stabilizing compression or endurance-threshold credit has been added.','S'),p('Independent keeper substitution','L'),p('For the W24X131 trial, P = 20 kip, H = 1 kip, rail depth = 6 in and eccentricity = 0.25 in. With a 6-in base, 0.5-in keeper projection, 0.75-in base thickness, 1-in keeper thickness and 3-in width: U = (Hh + Pe)/b = 1.8333 kip; M = Ua + H(tb + tk/2) = 2.1667 kip-in. Local flange stress = 6M/(bk tf^2) = 3.4239 ksi using tf = 1.125 in; full local range = 6.8477 ksi. The prior local range was 27.6331 ksi, before global effects.'),p('Regression checks confirm that LRFD/ASD, impact factors and an unrelated strength multiplier do not alter the fatigue ranges. A zero-lift bin still has empty-crane forces and nonzero damage.','S'),PageBreak()]

rows=[['W-shape','Restraint (ft)','e (in)','Major D/C','Twist D/C','Failed checks']]
for t in data['results']:
 rows.append([t['shape'],f'{t["braceFeet"]:g}',f'{t["eccIn"]:g}',f'{ck(t,"major")["utilization"]:.3f}',f'{ck(t,"rail-twist")["utilization"]:.3f}',str(len(t['failures']))])
story += [p('18 sizing scenarios, unchanged criteria','H'),p('These are fictitious app scenarios, not 18 permit designs. All use three simply supported 25-ft bays, two 20-kip static wheels at 10-ft spacing, 25% impact for strength, 2-kip side thrust per wheel and the original connection inputs. Changes to restraint spacing or eccentricity are explicitly shown.'),table(rows,[105,79,63,88,88,93]),Spacer(1,9),p('W24X229 is the lightest passing W24 among the seven W24 sizes tested at the original restraints. W24X207 fails twist by about 20%. W14X211 also passes and is 7.9% lighter than W24X229, but substantially changes girder depth; it is retained as an alternative rather than the default.'),p('The W24X162 trial with 12.5-ft restraints nearly passes, but its end-connection gross plate shear ratio is 1.0255. Adding restraints alone does not complete that alternative. The receiving building and support capacity would also require design. Failed-check counts include repeated material points; they are not counts of independent failure modes.','S'),p('Reproduction','L'),p('Results and full snapshots: output/keeper-fatigue-revision/ and output/keeper-fatigue-alternatives/. Run scripts/reviewPermitSizing.ts with the output directory and optional alternatives argument. The normal engine, capacities and failure/export gates are used. The earlier pre-correction outputs remain under output/permit-sizing/.','S'),PageBreak()]

rows=[['Assembly / property','Published DG7','AISC v16 transform','Difference']]
for item in data['dg7']:
 for k in ['Ix','It','cy','Sbottom','Stop']:
  a=item['app'][k];v=item['source'][k]
  rows.append([f'{item["app"]["section"]} / {k}',f'{v:g}',f'{a:.3f}',f'{100*(a/v-1):+.3f}%'])
story += [p('Cap channels: verified elastic properties','H'),p('The dropdown now uses 72 AISC v16 C/MC sections. The inverted channel contributes its actual tabulated area, centroid and rotated inertias. The parallel-axis theorem determines the combined centroid and major-axis inertia. This assumes full longitudinal composite action; cap attachment adequacy is separate.'),table(rows,[228,87,114,87]),Spacer(1,8),p('DG7 third edition, Appendix Table A-1, printed p.115; Example 14.1.3, printed p.70. Ix and It are in4, cy is inches above the bottom, and section moduli are in3. All 15 comparisons are within 0.5%, consistent with the table precision. It is the top flange plus channel lateral inertia. An independent central point-load test also verifies the first-order flange-force couple and elastic deflections.','S'),p('Full capped-section design remains blocked','L'),p('Elastic properties alone do not complete monosymmetric flexure/stability, shear-center and warping stress recovery, rail-head twist, cap-to-flange shear transfer, fit-up gaps or attachment fatigue. The app does not credit approximate capped torsional properties to design resistance. It also requires separate confirmation of channel grade and CMAA crane duty; an AIST building class is not a CMAA class.'),p('The 1998 Ellifritt/Lue paper provides approximate Cw and J estimates for CMAA A-C, with an area-ratio range of 0.20-0.95. Those estimates appear only as research information. Its repeated monosymmetry equation has an inconsistent definition; Eq.11 is used for the displayed diagnostic. DG7 advises against cap channels for CMAA E/F duty.','S'),p(link('https://ej.aisc.org/index.php/engj/article/view/699','Original AISC Engineering Journal article')+'; exact source hashes, applicability and equation audit are in references/SOURCE_REGISTER.md. The source DOI/publisher, not a third-party calculation summary, identifies the research.','S',True),PageBreak()]

story += [p('What the actual permits establish','H'),p('Two municipal packages document three capped runway arrangements. The lighter assemblies remain useful context, but neither package establishes adequacy for this sample. These comparisons do not complete a capped-frame analysis or validate the app end to end.'),table([
 ['Permit / assembly','Source arrangement','Nominal beam + cap weight'],
 ['Everett B2306-034\nW24X76 + C15X33.9','25 ft 6 in bays; 18.36-kip static wheels, 16-ft spacing; 500,000 runway cycles','109.9 lb/ft'],
 ['Puyallup PRCTI20230447\nW18X76 + C15X33.9','Existing 29-ft bay with knee regions; 22-ft principal model segment','109.9 lb/ft'],
 ['Same Puyallup package\nW30X99 + C15X33.9','44 ft 6 in bay; 41 ft 6 in principal model segment; knee supports','132.9 lb/ft'],
 ['Revised fictitious sample\nBare W24X229','Three 25-ft bays; both-flange restraints at 25 ft; 0.005-rad owner limit','229.0 lb/ft'],
 ],[180,238,98]),Spacer(1,8),p('The sample remains 2.08 times the Everett assembly weight and 1.72 times the Red Dot W30 assembly weight. These exclude rail and connections. Sample wheel-only vertical moment is 160.000 kip-ft versus 117.045 kip-ft for the Everett wheel arrangement, about 37% higher. The rail and fatigue details also differ. The present evidence supports investigating a capped alternative, not substituting the permit section directly.','S'),p('Red Dot composite-property worksheets: differences retained','L')]
rows=[['Assembly / property','Permit output','AISC v16 transform','Difference']]
for item in data['redDot']:
 for k in ['Ix','Iy','Stop']:
  a=item['app'][k];v=item['source'][k];rows.append([f'{item["source"]["w"]} + C15 / {k}',f'{v:.3f}',f'{a:.3f}',f'{100*(a/v-1):+.3f}%'])
story += [table(rows,[228,87,114,87]),Spacer(1,7),p('Permit PDF pp.53-54. The source uses component areas totaling 32.017 / 38.717 in2; the pinned v16 data give 32.3 / 39.0 in2. These input/property differences are not exact matches and have not been backfitted. The Red Dot RISA W30 model separately lists Ix = 5269.516 and Iy = 346.179 in4, inconsistent with its composite worksheet; full replay needs that resolved. The source moving-load schedule contains one 24.8-kip point with a 1.1 multiplier; a second wheel is not inferred.','S'),p(link('https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1','Everett municipal record')+' - Smithwick SE-DS-RPT-17691 Rev.1, 25 July 2023, printed pp.7,19,20,24. '+link('https://permits.puyallupwa.gov/Portal/Permit/GetFile?docId=107692','Puyallup accepted permit package')+' - AHBL 2220760.20, accepted 3 May 2023, PDF pp.8,14,26-28,53-54.','S',True),p('For an actual project, obtain the complete manufacturer wheel/side/bumper schedule, service duty and rail/keeper system; coordinate real tie stiffness, building brackets, frame and foundations. The issued demonstration remains explicitly fictitious and excludes those receiving-structure capacities.','S')]

out=ROOT/'output/pdf/crane-runway-cap-and-fatigue-validation.pdf'
SimpleDocTemplate(str(out),pagesize=(612,792),leftMargin=48,rightMargin=48,topMargin=62,bottomMargin=58,title='CraneCalc - cap and keeper fatigue validation',author='CraneCalc review').build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
