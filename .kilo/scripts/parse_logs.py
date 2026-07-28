import sys, json
data = json.load(sys.stdin)
# Get all entries
entries = data if isinstance(data, list) else [data]
for e in entries:
    ts = e.get('timestamp','')[:19]
    sev = e.get('severity','')
    text = e.get('textPayload','')[:200]
    req = e.get('httpRequest', {})
    if req:
        status = req.get('status', '')
        method = req.get('requestMethod', '')
        url = req.get('requestUrl', '')[:100]
        latency = req.get('latency', '')
        print(f'[{ts}] {method} {url} -> {status} ({latency})')
    elif text:
        print(f'[{ts}] {sev}: {text}')
