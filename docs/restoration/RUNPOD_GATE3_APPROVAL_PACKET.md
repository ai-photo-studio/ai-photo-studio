# RunPod Gate 3 Approval Packet

## Verified Facts

- Immutable image: `sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278`
- Source SHA: `9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7`
- Intended purpose: development health/dry_run canary only
- Endpoint/template status: not created
- Production routing: prohibited
- Active workers: `0`
- Maximum Flex workers after approval: `1`
- Concurrency: `1`
- Retries: `0`
- Timeout: `120 seconds`
- Maximum jobs before approval: `0`
- Maximum jobs after approval: `1`
- API key: secret reference only
- No GFPGAN quality approval
- No production activation
- Evidence required after canary: health, dry_run, output integrity, budget, and abort/cleanup verification

## Unresolved Inputs

- GPU type: unverified
- GPU rate: unverified
- Fixed budget: unapproved

## Abort And Cleanup

If any canary evidence fails, abort immediately, keep production routing disabled, delete any temporary RunPod resources, record the failure evidence, and do not proceed to Gate 4.
