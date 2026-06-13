import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import { StatusBadge } from "../components/StatusBadge";

export function AdminOrderDetail() {
  const { id = "" } = useParams();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.orderDetail(id).then(setData).catch(() => setData(null));

  useEffect(() => {
    load();
  }, [id]);

  const action = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p>Loading order...</p>;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Order {data.order.orderNo}</h2>
      <p>Customer: {data.customer.whatsappNumber}</p>
      <p>Package: {data.package.name}</p>
      <p>Payment: <StatusBadge value={data.order.paymentStatus} /> | Order: <StatusBadge value={data.order.orderStatus} /></p>
      <p>Delivery: {data.deliveryStatus}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => action(() => adminApi.retryOrder(id))}>Retry Failed Images</button>
        <button disabled={busy} onClick={() => action(() => adminApi.sendAgain(id))}>Send Delivery Again</button>
      </div>
      <h3>Images</h3>
      <ul>
        {data.images.map((img: any) => (
          <li key={img.id}>{img.kind} - {img.storageKey}</li>
        ))}
      </ul>
      <h3>AI Jobs</h3>
      <ul>
        {data.aiJobs.map((job: any) => (
          <li key={job.id}>
            {job.operation} - {job.provider} - {job.status}
            {job.errorMessage ? ` (${job.errorMessage})` : ""}
            {job.durationMs ? ` [${job.durationMs}ms]` : ""}
          </li>
        ))}
      </ul>
      <h3>Quality diagnostics</h3>
      <ul>
        {(data.qualityScores || []).map((score: any) => (
          <li key={score.id}>
            Category {score.category || "—"} | Confidence {score.classificationConfidence ?? "—"} | Profile {score.processingProfile || "—"} | Overall {score.overallScore} | Enhancement {score.enhancementScore ?? "—"} | Stage {score.processingStage || "—"}
          </li>
        ))}
      </ul>
    </section>
  );
}
