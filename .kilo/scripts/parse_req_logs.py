import sys, json
d = json.load(sys.stdin)
entries = d.get('entries', [])
print(f'Found {len(entries)} request log entries')
for e in entries[:10]:
    req = e.get('httpRequest', {})
    ts = e.get('timestamp','')[:19]
    rev = e.get('resource',{}).get('labels',{}).get('revision_name','')
    method = req.get('requestMethod','')
    status = req.get('status','')
    latency = req.get('latency','')
    url = req.get('requestUrl','')[:120]
    print(f'[{ts}] rev={rev} {method} {status} latency={latency}')
    print(f'  URL: {url}')
