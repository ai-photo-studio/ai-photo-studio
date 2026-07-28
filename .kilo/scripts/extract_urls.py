import sys, re
js = sys.stdin.read()
# Find all API URL patterns
urls = re.findall(r'https?://[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}(?:/[a-zA-Z0-9._/-]+)*', js)
for u in sorted(set(urls)):
    print(u)
