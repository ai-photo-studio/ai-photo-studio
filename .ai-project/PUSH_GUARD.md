# Push Guard

Use `npm run push:safe` before every push.

The guard blocks pushes when sensitive or out-of-scope files are staged/changed, including:
- `.env` and `.env.*`
- credential/secret key files
- `docs/`, `README.md`, and markdown files outside approved `.ai-project` guard markdown
- build artifacts and dependency folders

This repository only allows guarded pushes to:
- remote: `https://github.com/gardenshop/ai-photo-studio-whatsapp.git`
- branch: `main`
