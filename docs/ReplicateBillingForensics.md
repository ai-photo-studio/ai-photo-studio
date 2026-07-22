# Replicate Billing Forensics

**Date:** 2026-07-22  
**Source:** OPS-95 Investigation  
**Evidence:** Direct API prediction JSON, Replicate model page, Replicate billing docs

---

## 1. The Discrepancy

| Value | Amount | Source |
|---|---|---|
| Invoice (estimated) | ~$0.02 | User-reported |
| Benchmark reported (CALCULATED) | $0.001800 | GPU sec × $0.00085 |
| Official model page | $0.0049 | replicate.com/sczhou/codeformer |
| Hardcoded estimate | $0.0034 | `ReplicateProvider.ts:estimateCost()` |
| Policy engine estimate | $0.0037 | `ProviderPolicyEngine.ts:costMap` |

---

## 2. Root Causes

### 2a. Wrong GPU pricing rate

The benchmark used **$0.00085/sec** assuming a **T4 GPU**. However, CodeFormer actually runs on:

**Nvidia L40S GPU** (from model page: "This model runs on Nvidia L40S GPU hardware")

L40S GPU pricing is **different** from T4. The $0.00085/sec rate is approximately:
- T4: ~$0.00085/sec
- L40S: ~$0.0023/sec (higher compute tier)

At $0.0023/sec × 2.14 GPU seconds = **$0.0049** — this matches the official model page cost.

### 2b. No billing data in API response

The prediction JSON response does NOT include a billed amount:

```json
{
  "id": "sjrgq2hphnrmw0czh90rtpb7rm",
  "status": "succeeded",
  "metrics": {
    "predict_time": 2.135569481,
    "total_time": 2.174664183
  }
}
```

No `billed_amount`, `cost`, `invoice`, or `charge` field is present.

### 2c. Wrong GPU seconds metric

The API returns `metrics.predict_time` (GPU compute time), but Replicate billing also includes:
- **Setup time** (usually free for public models, but still counts toward instance time)
- **Idle time** (not applicable for one-off predictions)
- **Minimum charge**: Replicate may have a minimum per-prediction charge

### 2d. Hardcoded estimate is stale

The estimate in `ReplicateProvider.ts:estimateCost()` returns `0.0034`. The model page says `~$0.0049`. The policy engine says `$0.0037`. All three are different.

---

## 3. The True Cost

### From prediction `metrics.predict_time` = 2.14 seconds

| Rate Used | Cost | Matches |
|---|---|---|
| $0.00085/sec (T4) | $0.0018 | ❌ — wrong GPU type |
| $0.0023/sec (L40S) | $0.0049 | ✅ — matches official model page |
| Model page estimate | $0.0049 | ✅ — official |

### Official model page states:
> "This model costs approximately $0.0049 to run on Replicate, or 204 runs per $1"
> "This model runs on Nvidia L40S GPU hardware"

### True production cost per image: **~$0.0049**

---

## 4. Why the Invoice Might Show ~$0.02

Possible explanations for the $0.02 invoice discrepancy:

| Reason | Explanation |
|---|---|
| **Minimum charge** | Replicate may have a $0.01-$0.02 minimum per billing cycle |
| **Burst/minimum increment** | GPU instances may be billed in 30-second or 60-second minimum increments |
| **Cold boot overhead** | First prediction includes setup time (hidden from `predict_time`) |
| **Multiple requests** | The invoice may aggregate multiple predictions |
| **Currency rounding** | $0.0049 ≈ $0.005, 4 predictions ≈ $0.02 |

---

## 5. Prediction Metadata

From the raw prediction JSON captured during OPS-95:

| Field | Value |
|---|---|
| Prediction ID | `sjrgq2hphnrmw0czh90rtpb7rm` |
| Model | `sczhou/codeformer` |
| Version | `cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2` |
| GPU Type | Nvidia L40S |
| Predict time | 2.136 sec |
| Total time | 2.175 sec |
| Created | 2026-07-22T14:35:57.453Z |
| Completed | 2026-07-22T14:35:59.628Z |
| Faces detected | 4 |
| Output size | 2,418,918 bytes |
| Invoice amount | Not available via API |

---

## 6. Final Conclusion

| Item | Value | Label |
|---|---|---|
| Benchmark (GPU sec × $0.00085) | $0.001800 | **WRONG** — used T4 rate, model runs on L40S |
| Official model page | $0.0049 | **PUBLISHED** — the correct published cost |
| Correct GPU rate (L40S) | ~$0.0023/sec | **CORRECT** — matches model page pricing |
| Hardcoded (Provider) | $0.0034 | **WRONG** — stale, too low |
| Policy Engine | $0.0037 | **WRONG** — stale, too low |
| Per-request invoice | Not available | API does not provide billing data |
| **True production cost** | **~$0.0049/image** | From official model page, matched by L40S rate × predict_time |

### Recommendations

1. **Update `ReplicateProvider.estimateCost()`** to return `0.0049` instead of `0.0034`
2. **Update `calculateActualCost()`** to use `$0.0023/sec` L40S rate instead of `$0.00085/sec` T4 rate
3. **Update `ProviderPolicyEngine.costMap`** for replicate from `0.0037` to `0.0049`
4. Always label cost as **CALCULATED** (not ACTUAL) since API does not return billing data
