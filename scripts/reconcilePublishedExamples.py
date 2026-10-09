"""Independent US-unit substitution for seven printed-rounding differences.
No app engine imports, formula changes, or tolerance widening.
"""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'output/published-examples/results.json'
data=json.loads(path.read_text())
checks=[
 ('AISC-03','Required Ix for L/360',5*(.75/12)*420**4/(384*29000*(420/360)),
  '5(0.75/12)(420)^4 / [384(29000)(420/360)]',
  'F-7 uses the rounded allowable deflection 1.17 in. That gives 746.33248 in4, printed as 746. The unrounded L/360 limit gives 748.46444 in4.'),
 ('AISC-06','ASD minor resistance',50*32.5/12/1.67,
  '50(32.5) / (12 x 1.67)',
  'F-29 rounds 1625 kip-in to 1630, then 136 kip-ft before dividing by 1.67. The app retains 1625 kip-in.'),
 ('AISC-06','ASD peak minor moment',(.667+2)*15**2/8,
  '(0.667 + 2)(15)^2 / 8',
  'F-28 rounds 2.667 kip/ft to 2.67 before calculating 75.1 kip-ft. The app retains the given 0.667 and 2.0 loads.'),
 ('AISC-10','LRFD tensile resistance',.75*(math.pi*.75**2/4)*(1.3*90-90/(.75*54)*((1.2*1.33+1.6*4)/(math.pi*.75**2/4))),
  '0.75 Ab [1.3(90) - 90/(0.75 x 54) (7.996/Ab)]; Ab = pi(0.75)^2/4',
  'J-6/J-7 rounds shear, bolt area, shear stress and reduced tensile stress in succession. Using the printed 76.8 ksi and 0.442 in2 gives 25.4592 kip, printed as 25.5.'),
 ('AISC-10','ASD reduced Fnt',1.3*90-90/(54/2)*(5.33/(math.pi*.75**2/4)),
  '1.3(90) - 90/(54/2) [5.33 / (pi(0.75)^2/4)]',
  'J-6 rounds required shear stress to 12.1 ksi. J-7 then obtains 76.7 ksi; exact bolt area gives 76.78449 ksi.'),
 ('AISC-12','LRFD group slip resistance',.3*(1.13*28*8-72),
  '0.3 [1.13(28)(8) - 72]',
  'J-14 multiplies rounded 9.49 kip/bolt by rounded reduction 0.716 and eight bolts, then prints 54.4 kip. Unrounded inputs give 54.336 kip.'),
 ('AISC-12','ASD group slip resistance',.3*(1.13*28*8-1.5*48)/1.5,
  '0.3 [1.13(28)(8) - 1.5(48)] / 1.5',
  'J-14 uses rounded 6.33 kip/bolt and 0.716, then prints 36.3 kip. Unrounded inputs give 36.224 kip.'),
]
out=[]
for ident,label,reference,equation,note in checks:
 case=next(c for c in data['cases'] if c['id']==ident)
 row=next(r for r in case['rows'] if r['label']==label)
 relative=abs(reference-row['app'])/abs(reference)
 assert relative<1e-7,(ident,label,reference,row['app'])
 out.append(dict(case=ident,label=label,unit=row['unit'],independent=reference,app=row['app'],relativeError=relative,equation=equation,note=note))
data['roundingReconciliations']=out
data['differenceClassification']={'conservativeBasis':6,'publishedIntermediateRounding':7,'unexplainedInThisSuite':0}
(ROOT/'output/published-examples/results-reconciled.json').write_text(json.dumps(data,indent=2))
print(f'{len(out)} independent substitutions agree within 0.00001%; original printed-result flags retained.')
