# Runtime Validation Report

## Scope

Move from static verification to live runtime validation for the local AI stack.

## Service Health

### Verified In Repository

- `services/yolo-detector`
- `services/product-classifier`
- `services/real-esrgan`
- `services/ic-light-lab`

### Live Runtime

- Not verified locally in this shell
- Bash execution is blocked by the local environment
- Python execution is blocked by the local environment

### Remote Health Fallback

- `railway status` reported `api` online
- `railway status` reported `background-remover` online
- `wrangler whoami` was not available as a command in this shell

## Validation Output

- `scripts/validation-output.json`: not produced in this shell

## Failed Checks

- `scripts/colab-preflight.sh`
- `scripts/validate-ai.py`
- Live import checks for `rembg`, `ultralytics`, `open_clip`, and `realesrgan`
- GPU detection in a real runtime session
- CUDA detection in a real runtime session
- Service health checks in a live runtime session

## API Verification

### Static Checks Passed

- `local-rembg` provider wiring
- `local-yolo` provider wiring
- `provider.factory` routing
- `image-processing.worker` persistence flow
- `ImageQualityScore` schema presence
- `ProviderCostLog` schema presence

### Live Persistence

- Not confirmed in this shell

## Screenshots / Paths

- None available from this shell

## Estimated Effort To Completion

- 1 to 2 hours in a live Colab GPU session
- 15 to 30 minutes to archive the output JSON and confirm persistence

## Next Step

Run `bash colab_setup.sh setup`, `bash colab_setup.sh validate`, and `bash colab_setup.sh cleanup` in a runtime that supports Bash and Python execution.
