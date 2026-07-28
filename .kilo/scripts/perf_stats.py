import sys, json
d = json.load(sys.stdin)
entries = d.get('entries', [])
# Count status codes
status_counts = {}
for e in entries:
    req = e.get('httpRequest', {})
    status = req.get('status', 0)
    status_counts[status] = status_counts.get(status, 0) + 1

print('Status Code Distribution:')
for s in sorted(status_counts.keys()):
    print(f'  HTTP {s}: {status_counts[s]}')

print()
print('Latencies (sorted):')
latencies = []
for e in entries:
    req = e.get('httpRequest', {})
    lat = req.get('latency', '0s')
    # Parse latency like "0.233001934s"
    try:
        secs = float(lat.replace('s', ''))
        latencies.append(secs)
    except:
        pass
if latencies:
    latencies.sort()
    print(f'  Count: {len(latencies)}')
    print(f'  Min:   {latencies[0]*1000:.1f}ms')
    print(f'  P50:   {latencies[len(latencies)//2]*1000:.1f}ms')
    print(f'  P95:   {latencies[int(len(latencies)*0.95)]*1000:.1f}ms')
    print(f'  Max:   {latencies[-1]*1000:.1f}ms')
    print(f'  Avg:   {sum(latencies)/len(latencies)*1000:.1f}ms')
