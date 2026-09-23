import { useEffect, useState } from "react";
import { apiClient } from "../../../api/client";
import { Toggle } from "../../../components/form/Field";
import { useBusiness } from "../../../context/BusinessContext";
import { useFeatureFlags } from "../../../context/FeatureFlagsContext";
import type { FeatureFlag } from "../../../api/types";

export default function FeatureFlagsPage() {
  const { activeBusiness } = useBusiness();
  const { refresh: refreshNav } = useFeatureFlags();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id]);

  async function toggle(flag: FeatureFlag) {
    setSavingKey(flag.key);
    try {
      await apiClient.patch(`/api/feature-flags/${flag.key}`, { enabled: !flag.enabled });
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: !f.enabled } : f)));
      // The sidebar/nav reads the same flags from FeatureFlagsContext — make
      // it pick up the change immediately instead of waiting for the next
      // business switch to refetch.
      await refreshNav();
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading...</p>;

  // design_studio has no page to switch on/off anymore -- keep it out of the
  // list rather than offering a toggle for something that isn't reachable.
  const moduleFlags = flags.filter((f) => f.business_id !== null && f.key !== "design_studio");
  const globalFlags = flags.filter((f) => f.business_id === null);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-ink">Modules</h2>
        <p className="mb-4 text-sm text-muted">
          Turn optional modules on or off for <span className="font-medium text-ink">{activeBusiness?.name}</span> —
          each business (Main/IIM) has its own switches, so one can run Quotations while the other doesn't. Core
          modules (Invoices, Customers, Settings) are always on and aren't listed here. Disabling a module hides it
          from the sidebar and blocks its API for this business.
        </p>
        <ul className="divide-y divide-line rounded-md border border-line">
          {moduleFlags.map((flag) => (
            <li key={flag.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{flag.label}</p>
                <p className="text-xs text-muted">{flag.key}</p>
              </div>
              <Toggle checked={flag.enabled} onChange={() => toggle(flag)} disabled={savingKey === flag.key} />
            </li>
          ))}
        </ul>
      </div>

      {globalFlags.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Install-wide</h3>
          <p className="mb-4 text-sm text-muted">
            These apply to the whole install, not just the active business.
          </p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {globalFlags.map((flag) => (
              <li key={flag.key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{flag.label}</p>
                  <p className="text-xs text-muted">{flag.key}</p>
                </div>
                <Toggle checked={flag.enabled} onChange={() => toggle(flag)} disabled={savingKey === flag.key} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
