interface LoginFailureState {
  failures: number;
  firstFailureAt: number;
  lockUntil: number;
}

interface LoginGuardResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_TIME_MS = 15 * 60 * 1000;

const failureStore = new Map<string, LoginFailureState>();

function cleanupExpired(nowMs: number) {
  if (failureStore.size < 512) {
    return;
  }

  for (const [key, value] of failureStore.entries()) {
    const inactive = value.lockUntil <= nowMs && value.firstFailureAt + FAILURE_WINDOW_MS <= nowMs;
    if (inactive) {
      failureStore.delete(key);
    }
  }
}

export function buildLoginAttemptKey(ip: string, email: string): string {
  return `${ip.toLowerCase()}::${email.trim().toLowerCase()}`;
}

export function getLoginGuardState(key: string): LoginGuardResult {
  const nowMs = Date.now();
  cleanupExpired(nowMs);

  const current = failureStore.get(key);
  if (!current) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.lockUntil > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((current.lockUntil - nowMs) / 1000), 1)
    };
  }

  if (current.firstFailureAt + FAILURE_WINDOW_MS <= nowMs) {
    failureStore.delete(key);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function registerFailedLoginAttempt(key: string) {
  const nowMs = Date.now();
  const current = failureStore.get(key);

  if (!current || current.firstFailureAt + FAILURE_WINDOW_MS <= nowMs) {
    failureStore.set(key, {
      failures: 1,
      firstFailureAt: nowMs,
      lockUntil: 0
    });
    return;
  }

  const failures = current.failures + 1;
  const lockUntil = failures >= MAX_FAILURES ? nowMs + LOCK_TIME_MS : current.lockUntil;

  failureStore.set(key, {
    failures,
    firstFailureAt: current.firstFailureAt,
    lockUntil
  });
}

export function clearLoginFailureState(key: string) {
  failureStore.delete(key);
}
