import sys, json
data = json.load(sys.stdin)
items = data.get('items', [])
print('Found %d domain mappings:' % len(items))
for item in items:
    spec = item.get('spec',{})
    status = item.get('status',{})
    domain = spec.get('domainName','?')
    route = status.get('route','?')
    conditions = status.get('conditions',[])
    print('  Domain: %s -> route: %s' % (domain, route))
    for c in conditions:
        ctype = c.get('type','?')
        cstatus = c.get('status','?')
        cmsg = c.get('message','')
        print('    %s: %s (%s)' % (ctype, cstatus, cmsg))
