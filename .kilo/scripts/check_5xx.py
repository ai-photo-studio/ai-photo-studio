import sys, json
d = json.load(sys.stdin)
entries = d.get('entries', [])
error_entries = [e for e in entries if e.get('httpRequest',{}).get('status',0) >= 500]
print('Total entries:', len(entries))
print('5xx errors:', len(error_entries))
for e in error_entries:
    req = e.get('httpRequest',{})
    print('  %s %s' % (req.get('status'), req.get('requestUrl','')[:100]))
if len(error_entries) == 0:
    # Print last 3 entries for context
    for e in entries[:3]:
        req = e.get('httpRequest',{})
        ts = e.get('timestamp','')[:19]
        print('  [%s] %s %s' % (ts, req.get('status'), req.get('requestUrl','')[:80]))
