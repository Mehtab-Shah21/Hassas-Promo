import { useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";

export default function LockScreen() {
  const { user, logout, unlock, loginWithPin, login } = useAuth();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!user) return;
      if (usePassword) {
        await login(user.email, password);
      } else {
        await loginWithPin(user.email, pin);
      }
      unlock();
    } catch {
      setError(usePassword ? "Incorrect password" : "Incorrect PIN");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-overlay">
        <h1 className="mb-1 text-lg font-semibold text-ink">Session locked</h1>
        <p className="mb-6 text-sm text-muted">Signed in as {user?.display_name ?? user?.email}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {usePassword ? (
            <input
              type="password"
              placeholder="Password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : (
            <input
              type="password"
              inputMode="numeric"
              placeholder="PIN"
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm tracking-widest text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Unlock
          </button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setUsePassword((v) => !v)}
              className="text-accent hover:underline"
            >
              {usePassword ? "Use PIN instead" : "Use password instead"}
            </button>
            <button type="button" onClick={logout} className="text-muted hover:underline">
              Sign out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
