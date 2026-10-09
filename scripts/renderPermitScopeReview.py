from pathlib import Path
import json
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/crane-runway-permit-scope-review.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor('#153449')
BLUE = colors.HexColor('#26768D')
INK = colors.HexColor('#243843')
MUTED = colors.HexColor('#526772')
LINE = colors.HexColor('#D8E2E6')
PALE = colors.HexColor('#F1F5F7')
AMBER = colors.HexColor('#956515')
AMBER_BG = colors.HexColor('#FBF4E5')
W = 516

ST = {
    'eyebrow': ParagraphStyle('eyebrow', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=BLUE, spaceAfter=12),
    'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=27, leading=31, textColor=NAVY, spaceAfter=15),
    'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=NAVY, spaceAfter=14),
    'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=NAVY, spaceBefore=12, spaceAfter=7),
    'body': ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=14, textColor=INK, spaceAfter=9),
    'small': ParagraphStyle('small', fontName='Helvetica', fontSize=8.5, leading=11.8, textColor=MUTED, spaceAfter=7),
    'cell': ParagraphStyle('cell', fontName='Helvetica', fontSize=8.5, leading=11.5, textColor=INK),
    'head': ParagraphStyle('head', fontName='Helvetica-Bold', fontSize=8.5, leading=11.5, textColor=colors.white),
}
story = []

def p(t, kind='body'):
    return Paragraph(t, ST[kind])

def add(t, kind='body'):
    story.append(p(t, kind))

def heading(n, title):
    if story:
        story.append(PageBreak())
    add(f'CRANECALC / PERMIT SCOPE REVIEW / {n:02}', 'eyebrow')
    add(title, 'h1')

def panel(title, text, warning=False):
    t = Table([[p(title, 'h2')], [p(text)]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), AMBER_BG if warning else PALE),
        ('BOX', (0, 0), (-1, -1), .7, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 13),
        ('RIGHTPADDING', (0, 0), (-1, -1), 13),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
    ]))
    story.extend([t, Spacer(1, 12)])

def table(headers, rows, widths):
    data = [[p(h, 'head') for h in headers]] + [[p(v, 'cell') for v in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), .5, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    story.extend([t, Spacer(1, 9)])

class ScopePath(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = W, 106
    def draw(self):
        c = self.canv
        labels = [('Wheel data', 'SUPPLIER INPUT'), ('Rail + girder', 'CALCULATED'), ('Girder details', 'TEMPLATES'), ('Bracket + frame', 'OUTSIDE MODEL'), ('Anchors + soil', 'OUTSIDE MODEL')]
        bw, gap, y = 96, 9, 42
        for i, (label, state) in enumerate(labels):
            x = i * (bw + gap)
            ext = i >= 3
            c.setFillColor(AMBER_BG if ext else PALE)
            c.setStrokeColor(AMBER if ext else BLUE)
            c.roundRect(x, y, bw, 47, 4, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont('Helvetica-Bold', 8.3)
            c.drawCentredString(x+bw/2, y+29, label)
            c.setFillColor(AMBER if ext else BLUE)
            c.setFont('Helvetica', 6.9)
            c.drawCentredString(x+bw/2, y+14, state)
            if i < 4:
                ax = x+bw
                c.setStrokeColor(MUTED)
                c.line(ax+1, y+23, ax+gap-1, y+23)
                c.line(ax+gap-1, y+23, ax+gap-4, y+26)
                c.line(ax+gap-1, y+23, ax+gap-4, y+20)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 8.3)
        c.drawString(0, 21, 'Current calculation boundary: forces are exported to the receiving structure.')
        c.drawString(0, 8, 'The complete building shown in 3D does not extend that calculation boundary.')

SOURCES = [
    ('E', 'Everett / Boeing 40-58 / DeShazo runway', 'https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1', 'SE-DS-RPT-17691 Rev. 1, 25 July 2023. B2306-034. Report pp. 16, 20, 24-28, 49 onward; municipal approval/inspection documents in the same record.'),
    ('R', 'Puyallup / Red Dot bridge crane evaluation', 'https://permits.puyallupwa.gov/Portal/Permit/GetFile?docId=107692', 'AHBL 2220760.20, 26 October 2022. PRCTI20230447. PDF pp. 1-3, 55-56 (section properties), 57-64 (footings).'),
    ('K', 'Kirkland / approved crane anchorage drawings', 'https://permits.kirklandwa.gov/WebDocs/2020121432/b55eec20-f73e-4eb0-8adf-2a9228a1f0b6.pdf', 'BNR23-09279, December 2023. Drawings, not a completed numerical calculation package. Related monorail/framing set BNR23-06698 is also drawing-only.'),
    ('N', 'Everett / 737 Northline engine offload lead', 'https://lfportal.everettwa.gov/WebLink/0/doc/1991641/Page13.aspx', 'Partial indexed calculation text. Full report and permit disposition not verified; viewer recovery did not restore the pages.'),
    ('O', 'Oceanside / San Luis Rey WWTP / Butler lead', 'https://www.oceansidepolice.com/home/showpublisheddocument/10900/638052360801430000', 'Indexed Butler job 1501198801, 6 August 2015; contents identify runway calculations at p. 206. Live document returned page-not-found; not verified.'),
    ('S', 'Shafter / fleet maintenance conversion lead', 'https://www.shafterca.gov/Archive/ViewFile/Item/1320', 'Council packet, 4 February 2020, PDF pp. 138-139. Scope references original calculations but supplies no usable calculation download at that location.'),
    ('P', 'Prince George\'s County / structural plan review scope', 'https://www.princegeorgescountymd.gov/DocumentCenter/View/33012/Third-Party-Plan-Review-Program-TPPRP-Manual-for-Buildings-PDF', 'Third-Party Plan Review Program Manual for Buildings, effective 2 November 2020, Appendix H, printed pp. 34-37. Process guidance, not a crane package.'),
    ('D', 'DOE / structural steel peer-review comments', 'https://ehss.energy.gov/deprep/2010/TB10D29A.PDF', '29 December 2010, PDF p. 4, comment 18 on 24590-HLW-SSC-S15T-00133 Rev. A. Specialized facility peer review, not a municipal permit package.'),
]
URL = {k: u for k, _, u, _ in SOURCES}

def ref(k):
    return f'<a href="{escape(URL[k], quote=True)}" color="#26768D">[{k}]</a>'

add('CRANECALC / EVIDENCE &amp; CAPABILITY REVIEW', 'eyebrow')
add('Detailed girder checks.<br/>An incomplete installed-system design.', 'title')
add('Public permit research and comparison with the current application<br/>08 October 2026', 'small')
panel('Research result: the requested 12 packages were not verified',
      'Two distinct crane calculation packages were verified in public permit files. One has explicit crane-permit approval evidence; the other has a separate-crane-permit qualification. Additional hits were incomplete records, drawings, specifications, or duplicates. This is a limited evidence review, not a 12-project validation study.', True)
add('The app has substantial coverage of moving loads, girder strength, torsion, serviceability, fatigue and defined connection details. Its largest shortfall for your arrangement is the steel receiving those connections: the column bracket, existing tapered frame, bracing, anchors and foundations.')
story.append(ScopePath())
add('What this means for your next design step', 'h2')
table(['Area', 'Current assessment'], [
    ('Runway member', 'A detailed design worksheet for supported geometries. Implemented checks still require independent engineering validation and verified project inputs.'),
    ('Installed structural system', 'Incomplete. The building interface is treated as fixed; the displayed prefab building does not have calculated strength or movement.'),
    ('Permit deliverable', 'Useful calculation and drawing components, but not a complete site-specific permit package on their own.'),
], [122,394])
add('Recommended first addition: a calculated bracket-to-column load path, followed by the receiving frame and foundations. Add movement-compatible connection verification alongside the bracket design.', 'body')
add('The distinction between member calculations and overall project scope is supported by the public records and municipal review guidance listed on pages 2 and 6. No percentage-complete score is justified by this sample.', 'small')

heading(2, 'What qualified - and what did not')
add(f'<b>Everett, Boeing 40-58 / DeShazo.</b> Smithwick report SE-DS-RPT-17691 Rev. 1, 25 July 2023; permit B2306-034. The municipal record lists approval and issuance on 18 September 2023. The freestanding system uses a W24X76 + C15X33.9 runway. Its check schedule extends through girder and weld fatigue, tiebacks, columns, bases, anchors and seismic drift. The report delegates foundation verification; the same project file contains separate foundation work. It is one project, not two. {ref("E")}')
add(f'<b>Puyallup, Red Dot bridge crane evaluation.</b> AHBL 2220760.20, 26 October 2022, filed under PRCTI20230447 and accepted 3 May 2023. The 64-page file contains frame analysis, W18X76 + C15X33.9 and W30X99 + C15X33.9 properties, and longitudinal/transverse footing checks for bearing, stability, flexure and shear. PDF page 2 explicitly reserves the bridge crane for a separate permit; page 3 coordinates anchorage with the manufacturer. This is not proof of approval of the complete crane. The PRCTI20221709 posting is the same engineering report. {ref("R")}')
add('Other promising records excluded from the count', 'h2')
table(['Lead', 'Reason it is not an additional verified calculation package'], [
    (f'Kirkland / crane anchorage {ref("K")}', 'Approved installation/manufacturer drawings for several workstation cranes. Seals and notes do not substitute for numerical design calculations. Multiple cranes within this set are not independent permit packages.'),
    (f'Everett / Northline {ref("N")}', 'Indexed load calculations and a 95-page viewer record were found. The complete report, project scope and permit approval could not be verified; the viewer later returned no pages.'),
    (f'Oceanside / Butler {ref("O")}', 'Search index identifies a 210-page building calculation report with a crane-runway section. The live document was unavailable. Contents and permit disposition remain unverified.'),
    (f'Shafter / fleet shop conversion {ref("S")}', 'Public procurement material references original building calculations, but the reviewed document does not supply the actual calculations. Not counted.'),
    ('Specifications / worked examples', 'Crane procurement specifications, AISC examples, research papers and unrelated steel-beam permit reports are useful references but do not meet this request.'),
], [135,381])
add('Qualification rule: a distinct project, actual crane-support calculations, identifiable author/date, and a traceable permit filing. Approval is reported separately. This search does not establish that other public packages do not exist.', 'small')

heading(3, 'Where the app already has depth')
add('This assessment comes from the current calculation code and the saved capped demonstration. "Implemented" describes model coverage, not certification that every formula or engineering assumption is correct.', 'small')
table(['Design topic', 'Implemented checks', 'Important boundary'], [
    ('Moving loads and combinations', 'Wheel-train travel; empty, loaded and absent crane states; separate dead/lift/impact terms; side thrust and traction; ASD/LRFD combinations. Equilibrium and travel/spatial refinement gates.', 'The detailed model has applicability limits. Actual supplier wheel schedules and operating criteria must be supplied. Building environmental combinations are excluded.'),
    ('Girder strength and stability', 'Major/minor bending, shear, axial interaction, local slenderness and lateral-torsional buckling. Coupled lateral/warping response and finite girder-side restraint stiffness.', 'Idealized member and restraints; fixed building interfaces. Conservative Cb and elastic assumptions can govern sizing. No verified capacity for the receiving frame.'),
    ('Capped section', 'Transformed W + C/MC properties; both compression directions; F5-based resistance; cap weld strength/development and fatigue; shear-center and warping mechanics.', 'Centered full-length cap, full contact and continuous welds. Unsupported configurations are gated. Historical Cw differences remain unresolved (page 5).'),
    ('Local force transfer', 'Web yielding, crippling, buckling/sidesway checks; paired bearing stiffeners; bearing plate and steel contact; rail, keeper and receiving-flange local checks.', 'A girder bearing plate check is not a column-bracket check. Overlapping girder-web wheel patches require another model.'),
    ('Serviceability and fatigue', 'Vertical movement, lateral rail-head movement including twist, owner twist criterion, fatigue detail register and duty bins; weld-root and weld-throat checks.', 'Girder movement excludes building sway/settlement. Detail categories and duty evidence need project review; many output rows repeat stations or duty cases.'),
    ('Connections and separate bays', 'Defined double-cover bolt/plate/weld templates, tie strength/stiffness and fatigue, signed interface forces; independent bearings, locating/sliding roles, gap and travel checks.', 'In-plane templates do not establish arbitrary bolt tension/prying or out-of-plane movement compatibility. Continuous analysis does not design a field moment splice.'),
], [107,211,198])
add('Calculation depth is a strength of the app. Scope completeness is a separate question: neither a large number of checks nor an elaborate 3D connection establishes the capacity of excluded supporting steel.', 'body')

heading(4, 'What is still missing for your arrangement')
add('The following priorities are engineering inferences from the app boundary, the reviewed records and the actual column-supported layout. They are not a claim that every public package explicitly prints every check.', 'small')
table(['Missing work', 'What the app currently does', 'What closes the gap'], [
    ('1 / Brackets and columns', 'Reports forces delivered to reference building steel; checks girder-side bearing/details.', 'Use actual column and bracket geometry. Check eccentric bending/torsion, local web/flange force transfer, stiffeners/doublers, attachment bolts/welds, fatigue and support rotation.'),
    ('2 / Whole building', 'Shows tapered prefab frames, roof and bracing; assumes fixed connection interfaces.', 'Verify the existing frame, longitudinal bracing and shared column load path for crane plus applicable site actions. Include second-order response, frame sway and both-runway interaction.'),
    ('3 / Anchors and foundations', 'No calculated receiver base, anchors, slab, footing or soil resistance.', 'Carry signed concurrent forces to bases/anchors and concrete. Check applicable anchor modes, bearing, sliding, overturning, uplift, footing flexure/shear and geotechnical suitability.'),
    ('4 / Connection movement', 'Checks joint gaps and sliding travel; checks idealized in-plane connection strength.', 'Verify that actual ties and guides allow vertical deflection, end rotation and thermal movement without unintended restraint, prying or cyclic bending. Model bearing centerlines consistently.'),
    ('5 / End stops and rail layout', 'Reports full-speed bumper demand to a separate building stop; checks a rail-joint template.', 'Design the stop and its attachment/load path. Specify actual rail joint/anchor stations and free expansion lengths; connect these lengths to thermal checks and drawings.'),
    ('6 / Coordinated submission', 'Produces equations, references, revision-linked PDF, dimensions, notes and editable linework.', 'Add verified existing-condition/vendor documents, receiving-structure calculations or accepted delegated designs, clear design responsibility, project inspection requirements, checker closure and jurisdictional sheet requirements.'),
], [109,170,237])
add(f'Municipal review guidance explicitly includes design loads and combinations, crane loads, soils, special inspections, and structural/foundation review. This supports the wider project scope above; it is not a substitute for the project jurisdiction\'s requirements. {ref("P")}', 'small')
add(f'A relevant peer-review example challenged cyclic bending caused by vertical girder movement at a lateral brace plate. This is direct evidence that an axial tie check alone can miss a movement-induced demand. The source is a specialized DOE facility, not a typical commercial permit. {ref("D")}', 'small')

heading(5, 'Validation limits and implementation order')
panel('515 rows do not mean 515 independent limit states',
      'The saved capped demonstration has 515 output rows: 509 pass and 6 not applicable. Of these, 395 belong to the fatigue group. The example is fictitious, with a 2-ton crane and three 25-ft bays on W24X84 + C15X33.9. It demonstrates supported software behavior; it does not validate a real installation.')
add('The previous "dozen" comparisons are not twelve runway permits', 'h2')
add('The repository\'s twelve-report permit suite contains two crane-related reports, eight other steel reports and two timber reports. The separate twelve-case runway suite mixes full app fixtures with component/provision checks. Published section-property examples form another dataset. These are useful tests, but their counts cannot be combined into twelve independently verified crane designs.')
add('Keep the unresolved numerical issues visible', 'h2')
add('The saved capped-section review records Cw values 7.09-10.89% below a historical published table. Two Everett local-capacity comparisons also remain discrepant. These require reconciliation of geometry, assumptions and applicability; lower calculated capacity or stiffness is not a blanket proof of conservative behavior. This review did not rerun or expand those benchmarks.')
table(['Sequence', 'Concrete next deliverable'], [
    ('First', 'One complete, independently checked bracket-to-column connection using the current simultaneous interface forces, including movement compatibility and fatigue. Extend the actual receiving-frame load path to bracing and foundations.'),
    ('Then', 'Resolve rail joint/anchor stationing, end-stop design and bearing-centerline representation. Carry the same geometry and assumptions into the equations, 3D view and drawing sheets.'),
    ('Before a permit claim', 'A site-specific design responsibility register and checked receiving-structure documents; vendor wheel/duty data; local code basis; final drawing/calculation coordination and responsible engineer review.'),
    ('For a real 12-project study', 'Obtain ten additional distinct qualifying packages and resolve the Red Dot separate-permit scope. Include the existing prefab-building bracket arrangement. Record source pages and inputs; reproduce demands, utilization, fatigue and movements, not just beam sizes.'),
], [106,410])
add('The app can currently export a verified calculation that contains failed engineering checks, with those failures identified. Export eligibility means the model ran within its supported gates; it does not mean the design passed or a permit was approved.', 'small')

heading(6, 'Source register and audit trail')
add('Links open the original public records. Source IDs on previous pages refer to this register. Accessed 08 October 2026. Search snippets were used only to identify leads unless specifically marked as partial evidence.', 'small')
for k, title, url, note in SOURCES:
    add(f'<b>[{k}] <a href="{escape(url, quote=True)}" color="#26768D">{escape(title)}</a></b><br/>{escape(note)}', 'small')
add('Local app evidence', 'h2')
add('Reviewed: src/engine/calculate.ts, designAnalysis.ts, detailAnalysis.ts, detailChecks.ts, capChecks.ts, cappedMechanics.ts, cappedStrength.ts, railChecks.ts, simpleSupports.ts and detailValidation.ts; server/index.ts and report templates. Scope was cross-checked with references/AIST_CHECKS.md and references/CAPPED_DESIGN.md, including their later additions.', 'small')
add('Saved example: output/capped-demonstration/snapshot.json, revision f5a54fd96b65aadd, generated 08 October 2026. Benchmark evidence: benchmarks/permitPackages.ts, benchmarks/permitCases.ts and the existing published-property review. No calculation-engine changes or new claim of numerical validation were made for this research review.', 'small')
add('Review method and remaining uncertainty', 'h2')
add('Searches covered public municipal permit/document portals, project calculation reports and procurement records. Direct record review, selected original PDF pages, municipal status text and local code inspection were used to classify evidence. Duplicates and unrelated examples were excluded. The small verified sample supports a scope comparison, not a statistical claim about what all engineers do or an assurance that the app is permit-ready.', 'small')

def footer(c, doc):
    c.setStrokeColor(LINE)
    c.line(48, 41, 564, 41)
    c.setFont('Helvetica', 8)
    c.setFillColor(MUTED)
    c.drawString(48, 28, 'CRANECALC  |  CAPABILITY REVIEW  |  08 OCTOBER 2026')
    c.drawRightString(564, 28, str(doc.page))

doc = SimpleDocTemplate(str(OUT), pagesize=(612,792), leftMargin=48, rightMargin=48,
                        topMargin=43, bottomMargin=53, title='CraneCalc - permit evidence and scope review',
                        author='CraneCalc review')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
