import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const button = document.getElementById("nav-google-auth");
const label = document.getElementById("nav-google-auth-label");

if (!button || !label) {
  // Current page does not include top-nav auth controls.
} else {
  const PUBLIC_CONFIG_ENDPOINT = "/api/public-config";
  const AUTH_ME_ENDPOINT = "/api/auth/me";
  const AUTH_CSRF_ENDPOINT = "/api/auth/csrf";
  const AUTH_FIREBASE_ENDPOINT = "/api/auth/firebase";

  let csrfToken = "";
  let authMode = "signin";
  let oneTapInitialized = false;
  let firebaseAuth = null;
  let googleProvider = null;

  function setButtonState(nextLabel, disabled) {
    label.textContent = nextLabel;
    button.disabled = Boolean(disabled);
  }

  function setAuthMode(mode) {
    authMode = mode;
    if (mode === "dashboard") {
      setButtonState("Open Dashboard", false);
      return;
    }
    setButtonState("Continue with Google", false);
  }

  function readErrorCode(error) {
    if (error && typeof error === "object" && "code" in error) {
      return String(error.code || "");
    }
    return "";
  }

  async function fetchPublicConfig() {
    const response = await fetch(PUBLIC_CONFIG_ENDPOINT, {
      credentials: "same-origin"
    });
    if (!response.ok) {
      return {};
    }
    return response.json();
  }

  function normalizeFirebaseConfig(publicConfig) {
    const raw = publicConfig?.firebaseConfig;
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const normalized = {
      apiKey: String(raw.apiKey || "").trim(),
      authDomain: String(raw.authDomain || "").trim(),
      projectId: String(raw.projectId || "").trim(),
      storageBucket: String(raw.storageBucket || "").trim(),
      messagingSenderId: String(raw.messagingSenderId || "").trim(),
      appId: String(raw.appId || "").trim(),
      measurementId: String(raw.measurementId || "").trim()
    };

    if (
      !normalized.apiKey ||
      !normalized.authDomain ||
      !normalized.projectId ||
      !normalized.storageBucket ||
      !normalized.messagingSenderId ||
      !normalized.appId
    ) {
      return null;
    }

    return normalized;
  }

  async function ensureFirebaseAuth(publicConfig) {
    if (firebaseAuth && googleProvider) {
      return true;
    }

    const configPayload = publicConfig || (await fetchPublicConfig());
    const firebaseConfig = normalizeFirebaseConfig(configPayload);
    if (!firebaseConfig) {
      return false;
    }

    const firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    googleProvider = new GoogleAuthProvider();
    return true;
  }

  async function fetchCsrfToken() {
    const response = await fetch(AUTH_CSRF_ENDPOINT, {
      method: "GET",
      credentials: "include"
    });
    const data = await response.json();
    csrfToken = data.csrfToken || "";
  }

  async function postFirebaseIdToken(idToken) {
    if (!csrfToken) {
      await fetchCsrfToken();
    }

    const response = await fetch(AUTH_FIREBASE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      credentials: "include",
      body: JSON.stringify({ idToken })
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (response.status === 403 && payload?.error === "Invalid CSRF token") {
      csrfToken = "";
    }

    if (!response.ok) {
      throw new Error(payload?.error || "Google sign-in failed");
    }
  }

  async function syncSessionState() {
    try {
      const response = await fetch(AUTH_ME_ENDPOINT, {
        credentials: "include"
      });
      setAuthMode(response.ok ? "dashboard" : "signin");
    } catch {
      setAuthMode("signin");
    }
  }

  function loadGoogleIdentityScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const existing = document.querySelector("script[data-google-identity='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Identity script failed")), {
          once: true
        });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Identity script failed"));
      document.head.appendChild(script);
    });
  }

  async function completeLoginWithFirebaseUser(user) {
    const idToken = await user.getIdToken();
    await postFirebaseIdToken(idToken);
    setAuthMode("dashboard");
    window.location.href = "/app";
  }

  async function handleOneTapCredential(response) {
    if (!response?.credential) {
      return;
    }

    setButtonState("Signing in...", true);
    try {
      if (!(await ensureFirebaseAuth())) {
        throw new Error("Google sign-in is not configured");
      }
      const credential = GoogleAuthProvider.credential(response.credential);
      const result = await signInWithCredential(firebaseAuth, credential);
      await completeLoginWithFirebaseUser(result.user);
    } catch (error) {
      console.error("One Tap sign-in failed", error);
      try {
        if (firebaseAuth) {
          await signOut(firebaseAuth);
        }
      } catch {
        // noop
      }
      setAuthMode("signin");
    }
  }

  function promptOneTap() {
    if (!window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.prompt((notification) => {
      if (notification.isDisplayed()) {
        return;
      }
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setAuthMode("signin");
      }
    });
  }

  async function initializeOneTap(googleClientId) {
    if (!googleClientId || oneTapInitialized) {
      return;
    }

    await loadGoogleIdentityScript();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleOneTapCredential,
      auto_select: true,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: false
    });

    oneTapInitialized = true;
    promptOneTap();
  }

  async function loginViaPopup() {
    setButtonState("Connecting...", true);
    try {
      if (!(await ensureFirebaseAuth())) {
        throw new Error("Google sign-in is not configured");
      }
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await completeLoginWithFirebaseUser(result.user);
    } catch (error) {
      if (readErrorCode(error) !== "auth/popup-closed-by-user") {
        console.error("Popup sign-in failed", error);
      }
      try {
        if (firebaseAuth) {
          await signOut(firebaseAuth);
        }
      } catch {
        // noop
      }
      setAuthMode("signin");
    }
  }

  button.addEventListener("click", async () => {
    if (authMode === "dashboard") {
      window.location.href = "/app";
      return;
    }

    if (oneTapInitialized) {
      promptOneTap();
      return;
    }

    await loginViaPopup();
  });

  (async () => {
    await syncSessionState();
    if (authMode === "dashboard") {
      return;
    }

    try {
      const publicConfig = await fetchPublicConfig();
      await ensureFirebaseAuth(publicConfig);
      const googleClientId = String(publicConfig?.googleClientId || "").trim();
      if (googleClientId) {
        await initializeOneTap(googleClientId);
      }
    } catch (error) {
      console.error("Failed to initialize Google One Tap", error);
    }
  })();
}
