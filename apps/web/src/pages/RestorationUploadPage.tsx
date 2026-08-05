// R9.2-P6C-CUSTOMER-MVP-FLOW: market selection -> image upload -> RestorationDraft.
// Upload only happens on the explicit "Upload photo" button click -- never on
// mount, never automatically. Guest ownership token (if issued) is stored via
// the existing lib/guest.ts helper, unchanged.
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";

const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "PK", label: "Pakistan (PKR)" },
  { code: "US", label: "United States (USD)" },
  { code: "GB", label: "United Kingdom (USD)" },
  { code: "AE", label: "United Arab Emirates (USD)" }
];

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

export function RestorationUploadPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [country, setCountry] = useState("PK");
  const [confirmed, setConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !confirmed) return;
    setUploading(true);
    setError(null);
    try {
      const bodyBase64 = await readFileAsBase64(file);
      const result = await customerApi.createRestorationDraft(token || undefined, {
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        bodyBase64,
        country,
        confirmed: true
      });
      if (result.guestOwnershipToken) {
        setGuestOwnershipToken(result.id, result.guestOwnershipToken);
      }
      navigate(`/restore-mvp/${result.id}/preview`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to upload the image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Choose your market, then upload a photo.</h1>
        <p>Pricing and currency are decided by your confirmed country -- never guessed silently.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>Country</span>
          <select value={country} onChange={(event) => { setCountry(event.target.value); setConfirmed(false); }}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>I confirm this is my correct market/country.</span>
        </label>

        <label className="field">
          <span>Photo</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>

        {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

        <button type="submit" className="button button-block" disabled={!file || !confirmed || uploading}>
          {uploading ? "Uploading..." : "Upload photo"}
        </button>
      </form>
    </section>
  );
}
