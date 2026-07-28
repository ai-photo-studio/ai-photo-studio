import sys, json
data = json.load(sys.stdin)
# v2 API wraps in template differently
templ = data.get('template', {})
print('Service:', data.get('name','?'))
print('URI:', data.get('uri','?'))
print('latestReadyRevision:', data.get('latestReadyRevision','?').split('/')[-1])
print('latestCreatedRevision:', data.get('latestCreatedRevision','?').split('/')[-1])
for t in data.get('traffic', []):
    tt = t.get('type','?')
    pct = t.get('percent',0)
    rev = t.get('revision','latest')
    print('Traffic: %s %s%% -> %s' % (tt, pct, rev))
for c in data.get('conditions', []):
    print('Condition: %s = %s' % (c.get('type','?'), c.get('state','?')))
tc = data.get('terminalCondition', {})
print('Terminal: %s = %s' % (tc.get('type','?'), tc.get('state','?')))
scaling = templ.get('scaling', {})
print('Max instances:', scaling.get('maxInstanceCount','?'))
