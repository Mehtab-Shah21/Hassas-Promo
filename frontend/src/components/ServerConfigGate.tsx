import axios from "axios";
import { useState, type FormEvent, type ReactNode } from "react";
import { hasConfiguredServerUrl, setServerUrl } from "../api/client";

/**
 * Gate shown once on a fresh "employee" install (frontend-only, no local
 * backend) before anything else renders. CLAUDE.md §3 / PROMPT-SEQUENCE.md
 * Prompt 14: "Employee install: frontend only, asks for the admin PC address
 * on first run." The admin install always has a build-time VITE_API_URL (or
 * the localhost default, since the backend runs on the same PC), so this
 * screen never shows there — hasConfiguredServerUrl() is true immediately.
 */
export default function ServerConfigGate({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(hasConfiguredServerUrl());

  if (configured) return <>{children}</>;

  return <ServerSetupForm onDone={() => setConfigured(true)} />;
}

function ServerSetupForm({ onDone }: { onDone: () => void }) {
  const [address, setAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalize(input: string): string {
    let url = input.trim();
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    return url.replace(/\/+$/, "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const url = normalize(address);
    if (!url) return;
    setTesting(true);
    setError(null);
    try {
      const res = await axios.get(`${url}/api/health`, { timeout: 5000 });
      if (res.status !== 200) throw new Error("Unexpected response");
      setServerUrl(url);
      onDone();
    } catch {
      setError("Couldn't reach a PRO Invoicing server at that address. Check the admin PC is on and the address is correct.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-floating">
        <h1 className="mb-1 text-xl font-semibold text-ink">Connect to your office server</h1>
        <p className="mb-6 text-sm text-muted">
          Enter the admin PC's address on your network. Ask your admin if you're not sure — it's shown
          on the admin PC's Settings screen.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.168.1.50:8000"
            autoFocus
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={testing}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {testing ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
