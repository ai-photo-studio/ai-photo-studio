import sys, re
js = sys.stdin.read()

api_match = re.search(r'const\s+(\w+)\s*=\s*[\"\'](https://api\.thannow\.com)', js)
if api_match:
    print('API base URL definition: const %s = %s' % (api_match.group(1), api_match.group(2)))

auth_routes = re.findall(r'/api/auth/\w+', js)
print('\nAuth routes used by SPA:')
for r in sorted(set(auth_routes)):
    print('  ' + r)

rest_routes = re.findall(r'/api/restorations[^\"\'\s,;]*', js)
print('\nRestoration routes:')
for r in sorted(set(rest_routes)):
    print('  ' + r)

preview_routes = re.findall(r'/api/previews[^\"\'\s,;]*', js)
print('\nPreview routes:')
for r in sorted(set(preview_routes)):
    print('  ' + r)

order_routes = re.findall(r'/api/orders[^\"\'\s,;]*', js)
print('\nOrder routes:')
for r in sorted(set(order_routes)):
    print('  ' + r)

payment_routes = re.findall(r'/api/payments[^\"\'\s,;]*', js)
print('\nPayment routes:')
for r in sorted(set(payment_routes)):
    print('  ' + r)
