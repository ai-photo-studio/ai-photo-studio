# Background Remover Service

Minimal FastAPI service for Phase 1 of the AI Photo Studio background remover.

## Endpoints

- `GET /health`
- `POST /remove-bg`
- `POST /product-white`

## Notes

- Uses `rembg` with the default `isnet-general-use` model.
- Large images are resized before processing.
- `/remove-bg` returns a transparent PNG.
- `/product-white` returns a white-background JPG.
- Both POST endpoints accept raw image bytes in the request body with an `image/*` content type.
- This service is local only for now and is not deployed yet.

## Local test

Run the local check script after installing the Python dependencies:

```powershell
python services/background-remover/scripts/test_local.py
```
