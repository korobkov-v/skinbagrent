(function initSkinbagAnalytics() {
  const CONFIG_ENDPOINT = "/api/public-config";
  const EXCLUDED_API_PATHS = new Set(["/api/stats", "/api/public-config"]);
  const MAX_LABEL_LENGTH = 96;
  let fetchWrapped = false;

  function toText(value, fallback) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return fallback;
    }
    return normalized.length > MAX_LABEL_LENGTH ? normalized.slice(0, MAX_LABEL_LENGTH) : normalized;
  }

  function resolveRequestUrl(input) {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      return input.url;
    }
    if (input && typeof input === "object" && "url" in input) {
      return String((input).url || "");
    }
    return "";
  }

  function resolveRequestMethod(input, init) {
    if (init && typeof init === "object" && typeof init.method === "string") {
      return init.method.toUpperCase();
    }
    if (typeof Request !== "undefined" && input instanceof Request && input.method) {
      return input.method.toUpperCase();
    }
    return "GET";
  }

  function sendEvent(name, params) {
    if (typeof window.gtag !== "function") {
      return;
    }
    window.gtag("event", name, params || {});
  }

  function trackApiRequest(rawUrl, method, status, ok) {
    if (!rawUrl) {
      return;
    }
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (url.origin !== window.location.origin) {
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        return;
      }
      if (EXCLUDED_API_PATHS.has(url.pathname)) {
        return;
      }
      sendEvent("api_request", {
        api_path: url.pathname,
        api_method: method,
        api_status: Number.isFinite(status) ? status : 0,
        api_ok: ok ? 1 : 0
      });
    } catch {
      // noop
    }
  }

  function wrapFetch() {
    if (fetchWrapped || typeof window.fetch !== "function") {
      return;
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function trackedFetch(input, init) {
      const requestUrl = resolveRequestUrl(input);
      const method = resolveRequestMethod(input, init);

      try {
        const response = await nativeFetch(input, init);
        trackApiRequest(requestUrl, method, response.status, response.ok);
        return response;
      } catch (error) {
        trackApiRequest(requestUrl, method, 0, false);
        throw error;
      }
    };

    fetchWrapped = true;
  }

  function trackLinkClicks() {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const link = event.target.closest("a[href]");
      if (!link) {
        return;
      }

      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      let destination;
      try {
        destination = new URL(href, window.location.href);
      } catch {
        return;
      }

      const isInternal = destination.origin === window.location.origin;
      sendEvent("nav_click", {
        link_type: isInternal ? "internal" : "external",
        link_label: toText(link.textContent, "link"),
        link_target: isInternal
          ? `${destination.pathname}${destination.search}`
          : destination.href
      });
    });
  }

  function setupGtag(measurementId) {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);

    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: true });
  }

  async function start() {
    try {
      const response = await fetch(CONFIG_ENDPOINT, {
        credentials: "same-origin"
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const measurementId = toText(payload?.gaMeasurementId, "");
      if (!measurementId) {
        return;
      }

      setupGtag(measurementId);
      wrapFetch();
      trackLinkClicks();
    } catch {
      // noop
    }
  }

  start();
})();
