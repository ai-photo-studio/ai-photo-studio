import { useEffect, useState } from "react";
import { apiRequest, type PackageSummary } from "./api";

export const usePackages = () => {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await apiRequest<PackageSummary[]>("/api/packages");
        if (!cancelled) {
          setPackages(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setPackages([]);
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load packages");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { packages, loading, error };
};
