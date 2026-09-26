import { handleAuthRequest, isLocalHost } from "./auth.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isAllowedOrigin(origin, request, env) {
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;

  if (env.APP_ORIGIN) {
    try {
      if (origin === new URL(env.APP_ORIGIN).origin) return true;
    } catch {
      return false;
    }
  }

  if (env.AUTH_ENV === "development" && isLocalHost(requestUrl.hostname)) {
    try {
      const originUrl = new URL(origin);
      return originUrl.protocol === "http:" && isLocalHost(originUrl.hostname);
    } catch {
      return false;
    }
  }

  return false;
}

function addCorsHeaders(response, origin) {
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (!isAllowedOrigin(origin, request, env)) {
      return jsonResponse({ success: false, message: "Origin is not allowed." }, 403);
    }

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return addCorsHeaders(new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "600",
        },
      }), origin);
    }

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/account/data") {
        return addCorsHeaders(await handleAuthRequest(request, env), origin);
      }

      if (url.pathname === "/api/health/db") {
        if (request.method !== "GET") {
          return new Response(null, {
            status: 405,
            headers: { allow: "GET" },
          });
        }

        try {
          const result = await env.DB.prepare("SELECT 1 AS connected").first();
          if (result?.connected !== 1) {
            return jsonResponse({ success: false, database: "disconnected" }, 503);
          }

          return jsonResponse({ success: true, database: "connected" });
        } catch (error) {
          console.error("D1 health check failed", error);
          return jsonResponse({ success: false, database: "disconnected" }, 503);
        }
      }

      return jsonResponse({ success: false, error: "Not found" }, 404);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return jsonResponse({ success: false, error: "Not found" }, 404);
  },
};
