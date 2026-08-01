# RunPod Support Request (DRAFT — NOT SENT)

Status: prepared only, per explicit instruction not to send automatically. Requires separate user authorization to actually submit.

## Context (for whoever sends this)

Account has zero existing Network Volumes. `runpodctl gpu list --include-unavailable` confirms 16GB-class Serverless GPU types (RTX A4000, RTX A4500, RTX 4000 Ada, RTX 2000 Ada) are listed as available account-wide, with per-datacenter availability recorded in each GPU entry's `dataCenterAvailability` field. Neither `runpodctl datacenter list` nor `runpodctl gpu list` returns any field indicating Network Volume / storage support per datacenter — the REST API (`GET /v1/openapi.json`) likewise has no datacenter-capability-listing endpoint. We are therefore unable to determine, from any documented read-only interface, which (if any) datacenter both stocks a compatible GPU and permits Network Volume creation for this account.

## Questions

1. Which datacenters currently permit Network Volume creation for this account specifically?
2. Do Network Volumes require any account-level enablement or approval before they can be created via the API (`POST /v1/networkvolumes`)?
3. Of the datacenters that permit Network Volume creation for this account, which (if any) also stock a compatible 16GB-class Serverless GPU (RTX A4000 / A4500 / RTX 4000 Ada / RTX 2000 Ada)?
4. Is there any documented, stable API or CLI field we should be using to discover Network Volume / storage capability per datacenter programmatically, for future automation? (Neither `runpodctl datacenter list` nor `runpodctl gpu list` currently exposes one, as of runpodctl v2.8.0.)

## Not requested

We are not asking RunPod to create any resource on our behalf. This is a capability-discovery question only.
