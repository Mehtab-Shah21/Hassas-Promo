"""A small in-memory login throttle.

Both /api/auth/login and /api/auth/login-pin previously had NO limit at all
on failed attempts -- an attacker (on the LAN, or over the internet if this
instance is exposed for web testing/demo) could script unlimited password or
PIN guesses against any username, with a 4-6 digit PIN being especially
guessable (at most a million combinations, trivial to exhaust with no
throttle at all).

Deliberately in-process, not Redis/DB-backed: this app runs as a single
process per install (see packaging/run_server.py), so a module-level dict
guarded by a lock is both sufficient and adds no new infrastructure or
dependency. Keyed by username (not client IP) since the threat this defends
against is "guess this specific account's credential", and IP-based limiting
would also either do nothing behind a shared LAN/NAT address or wrongly
punish every employee on the same office network for one person's typos.
"""
from __future__ import annotations

import threading
import time

MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes
# Failed-attempt history older than this is forgotten even without a lockout,
# so the tracking dict doesn't grow forever on a long-running server.
WINDOW_SECONDS = 15 * 60

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}


def _key(username: str) -> str:
    return username.strip().lower()


def seconds_until_unlocked(username: str) -> int:
    """0 if not locked out; otherwise how many seconds remain."""
    k = _key(username)
    with _lock:
        until = _locked_until.get(k)
        if until is None:
            return 0
        remaining = until - time.monotonic()
        if remaining <= 0:
            _locked_until.pop(k, None)
            _failures.pop(k, None)
            return 0
        return int(remaining) + 1


def record_failure(username: str) -> None:
    k = _key(username)
    now = time.monotonic()
    with _lock:
        attempts = [t for t in _failures.get(k, []) if now - t < WINDOW_SECONDS]
        attempts.append(now)
        _failures[k] = attempts
        if len(attempts) >= MAX_ATTEMPTS:
            _locked_until[k] = now + LOCKOUT_SECONDS


def record_success(username: str) -> None:
    k = _key(username)
    with _lock:
        _failures.pop(k, None)
        _locked_until.pop(k, None)
