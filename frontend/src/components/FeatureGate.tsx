import type { ReactNode } from "react";
import { useFeatureFlags } from "../context/FeatureFlagsContext";
import PlaceholderPage from "./PlaceholderPage";

// Client-side counterpart to the server's require_module_enabled: blocks
// direct navigation to a disabled module's route (the sidebar link is
// already hidden by AppShell's own isEnabled check, but a bookmark or a
// typed URL would otherwise still render the page while the API calls it
// makes fail with 403s one by one). The server enforcement is what
// actually matters for security; this is just a clean UI response to it.
export default function FeatureGate({
  flag,
  label,
  children,
}: {
  flag: string;
  label: string;
  children: ReactNode;
}) {
  const { isEnabled, loading } = useFeatureFlags();
  if (loading) return null;
  if (!isEnabled(flag)) {
    return (
      <PlaceholderPage
        title={`${label} is turned off`}
        message="An admin has disabled this module for the active business. Switch business or re-enable it in Settings → Modules."
      />
    );
  }
  return <>{children}</>;
}
