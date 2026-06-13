import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "../lib/format";
import { usePackages } from "../lib/packages";
import type { CustomerOrderResponse, CustomerWalletResponse } from "../lib/portal-types";
import { customerApi } from "../services/customerApi";

const PRODUCT_MODES = ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO"] as const;
const VEHICLE_MODES = ["SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"] as const;
const FILE_LIMIT_BYTES = 10 * 1024 * 1024;

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image"));
    reader.readAsDataURL(file);
  });

export function OrdersPage() {
  const { token, status } = useAuth();
  const { packages, loading: packagesLoading, error: packagesError } = usePackages();
  const [wallet, setWallet] = useState<CustomerWalletResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [serviceType, setServiceType] = useState("web-upload");
  const [workflowType, setWorkflowType] = useState<"PRODUCT" | "VEHICLE">("PRODUCT");
  const [workflowMode, setWorkflowMode] = useState<(typeof PRODUCT_MODES)[number] | (typeof VEHICLE_MODES)[number]>(
    "PRODUCT_STUDIO"
  );
  const [file, setFile] = useState<File | null>(null);
  const [currentOrderNo, setCurrentOrderNo] = useState("");
  const [order, setOrder] = useState<CustomerOrderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPackage && packages.length > 0) {
      setSelectedPackage(packages[0].code);
    }
  }, [packages, selectedPackage]);

  useEffect(() => {
    let cancelled = false;
    if (status !== "ready" || !token) return;

    const loadWallet = async () => {
      setWalletLoading(true);
      try {
        const response = await customerApi.wallet(token);
        if (!cancelled) {
          setWallet(response);
          setWalletError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setWalletError(loadError instanceof Error ? loadError.message : "Unable to load wallet");
        }
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    };

    void loadWallet();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  useEffect(() => {
    if (workflowType === "VEHICLE" && !VEHICLE_MODES.includes(workflowMode as (typeof VEHICLE_MODES)[number])) {
      setWorkflowMode("SHOWROOM");
    }
    if (workflowType === "PRODUCT" && !PRODUCT_MODES.includes(workflowMode as (typeof PRODUCT_MODES)[number])) {
      setWorkflowMode("PRODUCT_STUDIO");
    }
  }, [workflowMode, workflowType]);

  const modeOptions = useMemo(
    () => (workflowType === "VEHICLE" ? VEHICLE_MODES : PRODUCT_MODES),
    [workflowType]
  );

  const loadOrder = async (orderNo: string) => {
    if (!token || !orderNo) return;
    setLoadingOrder(true);
    try {
      const response = await customerApi.order(orderNo, token);
      setOrder(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load order status");
    } finally {
      setLoadingOrder(false);
    }
  };

  useEffect(() => {
    if (!currentOrderNo || !token) return;
    void loadOrder(currentOrderNo);
    const timer = window.setInterval(() => {
      void loadOrder(currentOrderNo);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [currentOrderNo, token]);

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    if (!selectedPackage || !whatsappNumber.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await customerApi.createOrder(token, {
        whatsappNumber: whatsappNumber.trim(),
        packageSlug: selectedPackage,
        serviceType: `${serviceType.trim()}-${workflowType.toLowerCase()}`
      });
      setCurrentOrderNo(response.orderNo);
      setStatusMessage(`Order ${response.orderNo} created. Upload an image to start processing.`);
      await loadOrder(response.orderNo);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the order");
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !currentOrderNo || !file) return;
    if (file.size > FILE_LIMIT_BYTES) {
      setError("Selected file exceeds the 10 MB web upload limit");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const bodyBase64 = await readFileAsBase64(file);
      const response = await customerApi.uploadOrderImage(token, currentOrderNo, {
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        bodyBase64,
        workflowType,
        workflowMode
      });
      setStatusMessage(`Uploaded ${file.name}. Order ${response.orderNo} is ${response.orderStatus.toLowerCase()} and processing now.`);
      await loadOrder(response.orderNo);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the image");
    } finally {
      setBusy(false);
    }
  };

  const activeOrder = order;
  const availableBalance = wallet?.summary.availableBalance || 0;
  const reservedBalance = wallet?.wallet.reservedBalance || 0;
  const activeSubscription = wallet?.activeSubscription || null;
  const remainingSubscriptionCredits = activeSubscription
    ? Math.max(
        0,
        activeSubscription.monthlyCreditLimit - activeSubscription.monthlyCreditsUsed - activeSubscription.monthlyCreditsReserved
      )
    : 0;
  const canDownload = Boolean(activeOrder?.processedUrl && activeOrder.downloadAllowed !== false);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Customer dashboard</p>
        <h1>Track credits, uploads, and downloads in one place.</h1>
        <p className="section-lead">
          Your customer workspace focuses on upload, preview, and download while backend order systems stay internal.
        </p>
      </div>

      <div className="metric-grid">
        <article className="metric-card metric-card-accent">
          <span>Credits remaining</span>
          <strong>{walletLoading ? "..." : formatNumber(Math.max(0, availableBalance + remainingSubscriptionCredits))}</strong>
          <p>Wallet balance plus active subscription credits</p>
        </article>
        <article className="metric-card">
          <span>Available balance</span>
          <strong>{walletLoading ? "..." : formatMoney(availableBalance, wallet?.wallet.currency || "PKR")}</strong>
          <p>Ready to reserve for full-resolution jobs</p>
        </article>
        <article className="metric-card">
          <span>Reserved balance</span>
          <strong>{walletLoading ? "..." : formatMoney(reservedBalance, wallet?.wallet.currency || "PKR")}</strong>
          <p>Held for active processing jobs</p>
        </article>
        <article className="metric-card">
          <span>Free preview</span>
          <strong>1 + 3</strong>
          <p>1 guest preview, 3 credits for new accounts</p>
        </article>
      </div>

      <div className="split-layout">
        <form className="card stack" onSubmit={uploadImage}>
          <div className="section-heading section-heading-tight">
            <p className="eyebrow">Upload image</p>
            <h2>Choose a file and start processing</h2>
          </div>
          <label className="field">
            <span>WhatsApp number</span>
            <input
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              placeholder="+92 300 1234567"
              required
            />
          </label>
          <label className="field">
            <span>Credit bundle</span>
            <select value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)} required>
              <option value="" disabled>
                {packagesLoading ? "Loading credit bundles..." : "Choose a credit bundle"}
              </option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.code}>
                  {pkg.name} ({pkg.code})
                </option>
              ))}
            </select>
          </label>
          <div className="split-layout">
            <label className="field">
              <span>Type</span>
              <select
                value={workflowType}
                onChange={(event) => setWorkflowType(event.target.value as "PRODUCT" | "VEHICLE")}
                required
              >
                <option value="PRODUCT">Product</option>
                <option value="VEHICLE">Vehicle</option>
              </select>
            </label>
            <label className="field">
              <span>Style</span>
              <select
                value={workflowMode}
                onChange={(event) =>
                  setWorkflowMode(event.target.value as (typeof PRODUCT_MODES)[number] | (typeof VEHICLE_MODES)[number])
                }
                required
              >
                {modeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Image note</span>
            <input value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="product image" />
          </label>
          {packagesError && <p className="form-error">{packagesError}</p>}
          <button type="submit" className="button" disabled={busy || packagesLoading}>
            {busy ? "Uploading..." : "Upload image"}
          </button>
        </form>

        <form className="card stack" onSubmit={createOrder}>
          <div className="section-heading section-heading-tight">
            <p className="eyebrow">Credits</p>
            <h2>Buy credits when the free quota runs out</h2>
          </div>
          <label className="field">
            <span>Customer number</span>
            <input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="+92 300 1234567" required />
          </label>
          <label className="field">
            <span>Credit bundle</span>
            <select value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)} required>
              <option value="" disabled>
                {packagesLoading ? "Loading bundles..." : "Choose a bundle"}
              </option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.code}>
                  {pkg.name} ({pkg.code})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Plan note</span>
            <input value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="credit top-up" />
          </label>
          <p className="helper-text">
            {walletLoading
              ? "Loading wallet status..."
              : walletError
                ? walletError
                : `Available: ${formatMoney(availableBalance, wallet?.wallet.currency || "PKR")} | Reserved: ${formatMoney(reservedBalance, wallet?.wallet.currency || "PKR")} | Subscription credits: ${formatNumber(remainingSubscriptionCredits)}`}
          </p>
          <button type="submit" className="button button-secondary" disabled={busy || packagesLoading}>
            {busy ? "Buying..." : "Buy credits"}
          </button>
        </form>
      </div>

      {error && (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      )}

      {statusMessage && (
        <div className="state-panel">
          <p>{statusMessage}</p>
        </div>
      )}

      <article className="card stack">
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Order status</p>
          <h2>{activeOrder ? `Image ${activeOrder.orderNo}` : "Upload an image to see live status"}</h2>
        </div>
        {loadingOrder && <p className="helper-text">Refreshing order state...</p>}
        {activeOrder ? (
          <div className="stack">
            <div className="metric-grid">
              <article className="metric-card">
                <span>Status</span>
                <strong>{activeOrder.orderStatus}</strong>
                <p><StatusBadge value={activeOrder.orderStatus} /></p>
              </article>
              <article className="metric-card">
                <span>Preview</span>
                <strong>{activeOrder.processedUrl ? "Ready" : "Processing"}</strong>
                <p><StatusBadge value={activeOrder.orderStatus} /></p>
              </article>
              <article className="metric-card">
                <span>Total</span>
                <strong>{formatMoney(Number(activeOrder.total), activeOrder.currency)}</strong>
                <p>{activeOrder.package.name}</p>
              </article>
            </div>

            <dl className="detail-grid">
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(activeOrder.createdAt)}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{activeOrder.customer.whatsappNumber}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{workflowType}</dd>
              </div>
              <div>
                <dt>Style</dt>
                <dd>{workflowMode}</dd>
              </div>
            </dl>

            <div className="split-layout">
              <article className="card">
                <div className="section-heading section-heading-tight">
                  <p className="eyebrow">Original</p>
                  <h3>Uploaded image</h3>
                </div>
                {activeOrder.originalUrl ? (
                  <a href={activeOrder.originalUrl} target="_blank" rel="noreferrer" className="text-link">
                    Open original image
                  </a>
                ) : (
                    <p className="helper-text">Upload an image to keep the original and continue processing.</p>
                )}
              </article>
            <article className="card">
              <div className="section-heading section-heading-tight">
                <p className="eyebrow">Processed</p>
                <h3>Download PNG</h3>
              </div>
                {canDownload ? (
                  <>
                    <a href={activeOrder.processedUrl || "#"} target="_blank" rel="noreferrer" className="button button-block">
                      Download full-resolution PNG
                    </a>
                    <p className="helper-text">Expires: {formatDateTime(activeOrder.processedExpiresAt)}</p>
                  </>
                ) : (
                    <>
                      <button type="button" className="button button-block" disabled>
                        {activeOrder.processedUrl ? "Add credits to unlock full-resolution download" : "The processed file will appear here after completion"}
                      </button>
                      <p className="helper-text">
                        {activeOrder.processedUrl
                          ? activeOrder.downloadAllowed === false
                            ? "Full-resolution downloads are gated for this order until the backend confirms credit access."
                            : "The processed file is still preparing."
                          : "The processed file will appear here after completion."}
                      </p>
                    </>
                )}
              </article>
            </div>

            <article className="card">
              <div className="section-heading section-heading-tight">
                <p className="eyebrow">Timeline</p>
                <h3>Status history</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Source</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeOrder.statusHistory || []).map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.createdAt)}</td>
                        <td>
                          {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                        </td>
                        <td>{entry.source}</td>
                        <td>{entry.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <div className="section-heading section-heading-tight">
                <p className="eyebrow">Internal systems</p>
                <h3>Hidden processing details</h3>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>System</th>
                      <th>Status</th>
                      <th>Provider</th>
                      <th>Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeOrder.processingJobs || []).map((job) => (
                      <tr key={job.id}>
                        <td>{job.jobName}</td>
                        <td>{job.queueName}</td>
                        <td><StatusBadge value={job.status} /></td>
                        <td>{job.providerName || "mock"}</td>
                        <td>{job.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        ) : (
              <p className="helper-text">After you upload an image, the customer record will appear here.</p>
        )}
      </article>
    </section>
  );
}
