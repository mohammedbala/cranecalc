"""Independent elastic statics checks; no application calculation imports."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/permit-sizing'

def wheel_moment(span, spacing, force, origin):
    wheels = [x for x in (origin, origin + spacing) if 0 <= x <= span]
    reaction = sum(force * (span - x) / span for x in wheels)
    return max([0] + [reaction*x - sum(force*max(0, x-a) for a in wheels) for x in wheels])

results = []
for name, span, spacing, force in [('Current demonstration', 25, 10, 20), ('Everett permit', 25.5, 16, 18.36)]:
    # Support crossings, single-wheel stationary points and both two-wheel
    # stationary points cover every piecewise-quadratic bending envelope.
    origins = [-spacing, 0, span-spacing, span, span/2, span/2-spacing,
               span/2-spacing/4, span/2-3*spacing/4]
    candidates = [{'originFt': x, 'momentKipFt': wheel_moment(span, spacing, force, x)} for x in origins]
    governing = max(candidates, key=lambda c: c['momentKipFt'])
    sweep = max(wheel_moment(span, spacing, force, -spacing + (span+spacing)*i/200000) for i in range(200001))
    assert abs(sweep-governing['momentKipFt']) < 1e-6
    results.append({'case': name, 'spanFt': span, 'wheelSpacingFt': spacing, 'wheelKip': force,
                    'governing': governing, 'independentSweepKipFt': sweep, 'candidates': candidates})
assert abs(results[0]['governing']['momentKipFt']-160) < 1e-10
assert abs(results[1]['governing']['momentKipFt']-117.045) < 1e-10
(OUT/'wheel-moment-verification.json').write_text(json.dumps({
    'scope': 'Simple-span static vertical wheel loads only; excludes impact, load factors, distributed loads and frame action.',
    'equation': 'RA = sum(P*(L-a)/L); M(x)=RA*x-sum(P*max(0,x-a)), with only wheels on the span.',
    'sampleToEverettMomentRatio': results[0]['governing']['momentKipFt']/results[1]['governing']['momentKipFt'],
    'results': results}, indent=2))

deflections=[]
for trial in json.loads((OUT/'sizing-results.json').read_text()):
    snapshot=json.loads((OUT/f'{trial["id"]}.json').read_text())
    ix=snapshot['input']['section']['Ix']/25.4**4
    delta=20*90*(3*300**2-4*90**2)/(24*29000*ix)
    app=next(c['demand']/25.4 for c in snapshot['checks'] if c['id']=='vertical')
    assert abs(delta-app) < 1e-6
    deflections.append({'id':trial['id'], 'IxIn4':ix, 'independentDeltaIn':delta,
                        'appDeltaIn':app,'relativeError':abs(delta-app)/delta})
(OUT/'independent-verification.json').write_text(json.dumps({
    'equation':'delta_center = P*a*(3*L^2-4*a^2)/(24*E*Ix); P=20 kip, a=90 in, L=300 in, E=29000 ksi; two equal wheel loads symmetric about midspan',
    'results':deflections},indent=2))
print('Verified both permit-comparison wheel moments and all ten sample deflections.')
