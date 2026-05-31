import { useEffect, useState } from "react";
import { adminApi } from "../services/adminApi";
import { StatusBadge } from "../components/StatusBadge";

export function AdminFailedJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string>("");

  const load = () => adminApi.failedJobs().then(setJobs).catch(() => setJobs([]));

  useEffect(() => {
    load();
  }, []);

  const retry = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.retryJob(id);
      await load();
    } finally {
      setBusyId("");
    }
  };

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Failed Jobs</h2>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              {["Job ID", "Order", "Customer", "Operation", "Status", "Error", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td style={{ padding: 10 }}>{job.id}</td>
                <td style={{ padding: 10 }}>{job.order?.orderNo || "-"}</td>
                <td style={{ padding: 10 }}>{job.order?.customer?.whatsappNumber || "-"}</td>
                <td style={{ padding: 10 }}>{job.operation}</td>
                <td style={{ padding: 10 }}><StatusBadge value={job.status} /></td>
                <td style={{ padding: 10 }}>{job.errorMessage || "-"}</td>
                <td style={{ padding: 10 }}>
                  <button disabled={busyId === job.id} onClick={() => retry(job.id)}>
                    Retry Job
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
