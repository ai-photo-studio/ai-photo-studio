# Isolated RunPod Development Worker

Run `npm install` then `npm test`. PowerShell-safe health: `'{"mode":"health"}' | node worker.mjs --stdin`. File mode: `node worker.mjs --input-file "C:\path with spaces\request.json"`. Dry run accepts base64 image bytes. This package has no production imports, secrets, network calls, provider routing, or GFPGAN inference.
