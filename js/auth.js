const state = {
  authenticated: false,
  user: null,
  loading: true,
};

const PRODUCTION_API_URL = "https://acharak.amirchopan2001.workers.dev";
let authSuccessHandler = null;

function getApiBaseUrl() {
  const configuredUrl = document
    .querySelector('meta[name="acharak-api-url"]')
    ?.content.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    const workerHost = hostname === "[::1]" ? "[::1]" : hostname;
    return `http://${workerHost}:8787`;
  }

  return PRODUCTION_API_URL;
}

const API_BASE_URL = getApiBaseUrl();

function publishState(nextState) {
  Object.assign(state, nextState);
}

function getAuthState() {
  return { ...state };
}

async function authRequest(path, body, method = body === undefined ? "GET" : "POST") {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `به Worker در ${API_BASE_URL} وصل نشد. در حالت محلی، دستور «npx wrangler@4 dev» را اجرا کنید؛ برای انتشار، آدرس Worker و مبدأ frontend را بررسی کنید.`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `Worker در ${API_BASE_URL} به درخواست ${path} پاسخ JSON نداد (HTTP ${response.status}). آدرس Worker و تنظیمات اتصال را بررسی کنید.`,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `پاسخ Worker در ${API_BASE_URL} معتبر نیست (HTTP ${response.status}). اتصال Worker را بررسی کنید.`,
    );
  }

  if (!response.ok) {
    const error = new Error(result.message || "درخواست انجام نشد.");
    error.status = response.status;
    error.retryAfterSeconds = result.retry_after_seconds;
    error.registrationRequired = result.registration_required === true;
    throw error;
  }

  return result;
}

async function initializeAuth() {
  publishState({ loading: true });
  try {
    const result = await authRequest("/api/auth/me");
    publishState({
      authenticated: result.authenticated === true,
      user: result.authenticated === true ? result.user : null,
      loading: false,
    });
  } catch {
    console.warn("Unable to verify the current authentication session.");
    publishState({ authenticated: false, user: null, loading: false });
  }
  return getAuthState();
}

async function registerWithPhone({ first_name, last_name, phone }) {
  return authRequest("/api/auth/register", { first_name, last_name, phone });
}

async function loginWithPhone({ phone }) {
  return authRequest("/api/auth/login", { phone });
}

async function requestOtp(phone) {
  return authRequest("/api/auth/otp/request", { phone });
}

async function verifyOtp(phone, code) {
  const result = await authRequest("/api/auth/otp/verify", { phone, code });
  publishState({ authenticated: true, user: result.user, loading: false });
  if (authSuccessHandler) await authSuccessHandler(result.user);
  return result;
}

async function getAccountData() {
  return authRequest("/api/account/data");
}

async function saveAccountData(data, mode = "replace") {
  return authRequest("/api/account/data", { data, mode }, "PUT");
}

function setAuthSuccessHandler(handler) {
  authSuccessHandler = handler;
}

async function logout() {
  await authRequest("/api/auth/logout", {});
  publishState({ authenticated: false, user: null, loading: false });
}

export {
  getAuthState,
  getAccountData,
  initializeAuth,
  loginWithPhone,
  logout,
  registerWithPhone,
  requestOtp,
  saveAccountData,
  setAuthSuccessHandler,
  verifyOtp,
};
