import { useEffect, useState } from "react";
import { apiClient } from "../../../api/client";
import type { FeatureFlag } from "../../../api/types";

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get<FeatureFlag[]>("/api/feature-flags");
      setFlags(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(flag: FeatureFlag) {
    setSavingKey(flag.key);
    try {
      await apiClient.patch(`/api/feature-flags/${flag.key}`, { enabled: !flag.enabled });
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: !f.enabled } : f)));
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">Modules & Features</h2>
      <p className="mb-4 text-sm text-muted">
        Toggle optional modules on or off. This is a global, per-install setting — flip a flag off
        to sell a leaner build to a future client without deleting any code.
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {flags.map((flag) => (
          <li key={flag.key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{flag.label}</p>
              <p className="text-xs text-muted">{flag.key}</p>
            </div>
            <button
              onClick={() => toggle(flag)}
              disabled={savingKey === flag.key}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                flag.enabled ? "bg-accent" : "bg-wash-4"
              } disabled:opacity-50`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
                  flag.enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
