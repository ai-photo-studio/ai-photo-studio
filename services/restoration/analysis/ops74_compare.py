import json, os, hashlib
from PIL import Image
import numpy as np

OPS73_DIR = "D:\\models\\benchmark-outputs"
OPS74_DIR = "D:\\models\\benchmark-runs\\OPS74"
INPUT_DIR = "D:\\models\\benchmark-dataset"

def to_gray(arr):
    if len(arr.shape) == 2:
        return arr
    return 0.299 * arr[:,:,0] + 0.587 * arr[:,:,1] + 0.114 * arr[:,:,2]

def analyze(path):
    img = Image.open(path).convert("RGB")
    arr = np.array(img, dtype=np.float32)
    gray = to_gray(arr)
    w, h = img.size
    m = {"width": w, "height": h, "file_size": os.path.getsize(path)}
    m["brightness"] = round(float(np.mean(gray)), 2)
    m["contrast"] = round(float(np.std(gray)), 2)
    hist = np.histogram(gray.astype(np.uint8), bins=256, range=(0,255))[0]
    hn = hist / hist.sum()
    hn = hn[hn > 0]
    m["entropy"] = round(float(-np.sum(hn * np.log2(hn))), 3)
    if h > 2 and w > 2:
        lap = np.abs(-gray[:-2,1:-1] - gray[2:,1:-1] - gray[1:-1,:-2] - gray[1:-1,2:] + 4 * gray[1:-1,1:-1])
        m["laplacian_mean"] = round(float(np.mean(lap)), 2)
        m["edge_density"] = round(float(np.mean(lap > 15) * 100), 2)
        m["texture_energy"] = round(float(np.sum(lap ** 2)), 1)
    return m

results = []
for f in sorted(os.listdir(OPS74_DIR)):
    if not f.endswith("_OPS74_output.jpg"):
        continue
    base = f.replace("_OPS74_output.jpg", "")
    r = {"filename": base}
    ops73_path = os.path.join(OPS73_DIR, base + "_mvp_output.jpg")
    ops74_path = os.path.join(OPS74_DIR, f)
    orig_path = os.path.join(INPUT_DIR, base + ".jpg")
    
    if os.path.exists(ops73_path) and os.path.exists(ops74_path):
        with open(ops73_path, "rb") as fh:
            r["sha256_ops73"] = hashlib.sha256(fh.read()).hexdigest()[:12]
        with open(ops74_path, "rb") as fh:
            r["sha256_ops74"] = hashlib.sha256(fh.read()).hexdigest()[:12]
        
        r["identical"] = r["sha256_ops73"] == r["sha256_ops74"]
        
        m73 = analyze(ops73_path)
        m74 = analyze(ops74_path)
        for key in ["brightness","contrast","entropy","laplacian_mean","edge_density","texture_energy"]:
            r[key + "_73"] = m73.get(key, 0)
            r[key + "_74"] = m74.get(key, 0)
            if m73.get(key, 0) != 0:
                r[key + "_delta"] = round(m74.get(key, 0) - m73.get(key, 0), 2)
                r[key + "_pct"] = round((m74.get(key, 0) - m73.get(key, 0)) / m73.get(key, 0) * 100, 1)
        
        # Verdict: only count as improvement if Laplacian (sharpness) increased
        lap_delta = r.get("laplacian_mean_delta", 0)
        ent_delta = r.get("entropy_delta", 0)
        if lap_delta > 3:
            r["verdict"] = "IMPROVED"
        elif lap_delta < -3:
            r["verdict"] = "REGRESSED"
        else:
            r["verdict"] = "NEUTRAL"
        
        results.append(r)
        
        lap_s = f"lap={r.get('laplacian_mean_delta',0):+.1f}"
        ent_s = f"ent={r.get('entropy_delta',0):+.2f}"
        identical_str = "ID" if r["identical"] else "DIFF"
        v = r["verdict"]
        print(f"  {base:40s} {identical_str:4s} {lap_s:10s} {ent_s:10s} {v}")

improved = sum(1 for r in results if r["verdict"] == "IMPROVED")
regressed = sum(1 for r in results if r["verdict"] == "REGRESSED")
neutral = sum(1 for r in results if r["verdict"] == "NEUTRAL")
identical = sum(1 for r in results if r["identical"])
different = sum(1 for r in results if not r["identical"])
avg_lap_delta = round(sum(r.get("laplacian_mean_delta",0) for r in results) / max(1, len(results)), 2)
avg_ent_delta = round(sum(r.get("entropy_delta",0) for r in results) / max(1, len(results)), 2)

print(f"\n=== COMPARISON SUMMARY ===")
print(f"Total: {len(results)} | Identical: {identical} | Different: {different}")
print(f"Improved: {improved} | Regressed: {regressed} | Neutral: {neutral}")
print(f"Avg Laplacian delta: {avg_lap_delta:+.2f}")
print(f"Avg Entropy delta: {avg_ent_delta:+.2f}")

report_path = os.path.join(OPS74_DIR, "OPS74_vs_OPS73_comparison.json")
with open(report_path, "w") as f:
    json.dump({
        "summary": {
            "total": len(results),
            "improved": improved,
            "regressed": regressed,
            "neutral": neutral,
            "identical": identical,
            "different": different,
            "avg_laplacian_delta": avg_lap_delta,
            "avg_entropy_delta": avg_ent_delta
        },
        "results": results
    }, f, indent=2)
print(f"Report saved to {report_path}")
