const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const OTP_MIN_INTERVAL_MS = 60 * 1000;
const OTP_MAX_REQUESTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "acharak_session";
const ACCOUNT_DATA_MAX_BYTES = 2 * 1024 * 1024;
const GENERIC_LOGIN_MESSAGE = "اگر شماره همراه در آچارک ثبت شده باشد، کد تأیید برای آن ارسال می‌شود.";

class AuthError extends Error {
  constructor(message, status, retryAfterSeconds) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class OTPProvider {
  async send() {
    throw new Error("OTP provider is not configured.");
  }
}

class LocalDevelopmentOTPProvider extends OTPProvider {
  async send({ code }) {
    return { developmentCode: code };
  }
}

class UnconfiguredOTPProvider extends OTPProvider {
  async send() {
    throw new AuthError("ارسال کد تأیید هنوز برای این محیط پیکربندی نشده است.", 503);
  }
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function getOtpProvider(request, env, phone) {
  const testModeEnabled = env.DEV_OTP_ENABLED === "true";
  const hostname = new URL(request.url).hostname;
  const localDevelopment =
    env.AUTH_ENV === "development" &&
    testModeEnabled &&
    isLocalHost(hostname);
  const allowedPhones = String(env.DEV_OTP_PHONE_ALLOWLIST || "")
    .split(",")
    .map((value) => normalizePhone(value.trim()))
    .filter(Boolean);
  const allowlistedDevelopment =
    testModeEnabled &&
    !isLocalHost(hostname) &&
    allowedPhones.includes(phone);

  return localDevelopment || allowlistedDevelopment
    ? new LocalDevelopmentOTPProvider()
    : new UnconfiguredOTPProvider();
}

function getAuthSecret(env) {
  if (typeof env.AUTH_SECRET !== "string" || env.AUTH_SECRET.length < 32) {
    throw new AuthError("احراز هویت Worker به AUTH_SECRET معتبر نیاز دارد.", 503);
  }
  return env.AUTH_SECRET;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  let digits = value.trim().normalize("NFKC").replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  digits = digits.replace(/[\s().-]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;

  return /^09\d{9}$/.test(digits) ? digits : null;
}

function normalizeName(value, required) {
  if (value === undefined || value === null) {
    if (required) throw new AuthError("نام را وارد کنید.", 400);
    return null;
  }
  if (typeof value !== "string") throw new AuthError("نام واردشده معتبر نیست.", 400);

  const name = value.trim().replace(/\s+/g, " ");
  if ((required && !name) || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new AuthError(required ? "نام را به‌درستی وارد کنید." : "نام خانوادگی معتبر نیست.", 400);
  }
  return name || null;
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AuthError("درخواست باید از نوع JSON باشد.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8192) throw new AuthError("حجم درخواست بیش از حد مجاز است.", 413);

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 8192) {
      throw new AuthError("حجم درخواست بیش از حد مجاز است.", 413);
    }
    const body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError("بدنهٔ درخواست معتبر نیست.", 400);
    }
    return body;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("بدنهٔ درخواست معتبر نیست.", 400);
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomOtp() {
  const range = 2 ** 32;
  const ceiling = Math.floor(range / 10 ** OTP_LENGTH) * 10 ** OTP_LENGTH;
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= ceiling);
  return String(sample[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function authErrorResponse(error) {
  const body = {
    success: false,
    message: error instanceof AuthError ? error.message : "درخواست احراز هویت انجام نشد.",
  };
  if (error.retryAfterSeconds) body.retry_after_seconds = error.retryAfterSeconds;
  const headers = error.retryAfterSeconds
    ? { "retry-after": String(error.retryAfterSeconds) }
    : {};
  return jsonResponse(body, error.status || 500, headers);
}

function cookieValue(request) {
  const cookies = request.headers.get("cookie") || "";
  const sessionCookie = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  return sessionCookie ? sessionCookie.slice(SESSION_COOKIE.length + 1) : "";
}

function sessionCookie(token, maxAge) {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (maxAge !== null) attributes.push(`Max-Age=${maxAge}`);
  return attributes.join("; ");
}

async function updateRequestLimit(db, phoneHash, now) {
  const windowStartedBefore = now - OTP_REQUEST_WINDOW_MS;
  const intervalStartedBefore = now - OTP_MIN_INTERVAL_MS;
  const result = await db.prepare(`
    INSERT INTO otp_request_limits (
      phone_hash, window_started_at, last_requested_at, request_count
    ) VALUES (?, ?, ?, 1)
    ON CONFLICT(phone_hash) DO UPDATE SET
      request_count = CASE
        WHEN otp_request_limits.window_started_at <= ? THEN 1
        ELSE otp_request_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN otp_request_limits.window_started_at <= ? THEN ?
        ELSE otp_request_limits.window_started_at
      END,
      last_requested_at = ?
    WHERE otp_request_limits.window_started_at <= ?
      OR (
        otp_request_limits.request_count < ?
        AND otp_request_limits.last_requested_at <= ?
      )
    RETURNING request_count
  `).bind(
    phoneHash,
    now,
    now,
    windowStartedBefore,
    windowStartedBefore,
    now,
    now,
    windowStartedBefore,
    OTP_MAX_REQUESTS,
    intervalStartedBefore,
  ).first();

  if (result) return;

  const limit = await db.prepare(
    "SELECT window_started_at, last_requested_at, request_count FROM otp_request_limits WHERE phone_hash = ?",
  ).bind(phoneHash).first();
  const nextWindow = Number(limit.window_started_at) + OTP_REQUEST_WINDOW_MS;
  const nextInterval = Number(limit.last_requested_at) + OTP_MIN_INTERVAL_MS;
  const nextAllowedAt = Number(limit.request_count) >= OTP_MAX_REQUESTS
    ? nextWindow
    : nextInterval;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((nextAllowedAt - now) / 1000),
  );
  throw new AuthError("درخواست کد بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.", 429, retryAfterSeconds);
}

async function requestOtpForPhone({ db, env, request, phone, user, now }) {
  const provider = getOtpProvider(request, env, phone);
  if (provider instanceof UnconfiguredOTPProvider) {
    throw new AuthError("ارسال کد تأیید هنوز برای این محیط پیکربندی نشده است.", 503);
  }

  const secret = getAuthSecret(env);
  const phoneHash = await hmacHex(secret, `otp-rate:${phone}`);
  await updateRequestLimit(db, phoneHash, now);

  if (!user) {
    return jsonResponse({
      success: true,
      message: GENERIC_LOGIN_MESSAGE,
      resend_after_seconds: Math.ceil(OTP_MIN_INTERVAL_MS / 1000),
    });
  }

  const code = randomOtp();
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(now + OTP_TTL_MS).toISOString();
  const createdAt = new Date(now).toISOString();
  const codeHash = await hmacHex(secret, `otp:${challengeId}:${code}`);

  await db.prepare(
    "UPDATE otp_challenges SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL",
  ).bind(createdAt, user.id).run();
  await db.prepare(
    "INSERT INTO otp_challenges (id, user_id, phone, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(challengeId, user.id, phone, codeHash, expiresAt, createdAt).run();

  let delivery;
  try {
    delivery = await provider.send({ phone, code });
  } catch (error) {
    await db.prepare(
      "UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
    ).bind(createdAt, challengeId).run();
    throw error;
  }

  const response = {
    success: true,
    message: GENERIC_LOGIN_MESSAGE,
    resend_after_seconds: Math.ceil(OTP_MIN_INTERVAL_MS / 1000),
  };
  if (delivery?.developmentCode) response.development_otp = delivery.developmentCode;
  return jsonResponse(response);
}

async function getUserByPhone(db, phone) {
  return db.prepare(
    "SELECT id, phone, first_name, last_name FROM users WHERE phone = ?",
  ).bind(phone).first();
}

async function handleRegister(request, env) {
  const body = await readJson(request);
  const firstName = normalizeName(body.first_name, true);
  const lastName = normalizeName(body.last_name, false);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new AuthError("شماره همراه ایرانی معتبر وارد کنید.", 400);

  const provider = getOtpProvider(request, env, phone);
  if (provider instanceof UnconfiguredOTPProvider) {
    throw new AuthError("ارسال کد تأیید هنوز برای این محیط پیکربندی نشده است.", 503);
  }
  const secret = getAuthSecret(env);
  const existingUser = await getUserByPhone(env.DB, phone);
  if (existingUser) {
    return jsonResponse({
      success: false,
      message: "این شماره قبلاً ثبت شده است؛ برای ادامه وارد شوید.",
    }, 409);
  }

  const user = {
    id: crypto.randomUUID(),
    phone,
    first_name: firstName,
    last_name: lastName,
  };
  const inserted = await env.DB.prepare(
    "INSERT INTO users (id, phone, first_name, last_name) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO NOTHING",
  ).bind(user.id, phone, firstName, lastName).run();

  if (Number(inserted.meta?.changes) !== 1) {
    return jsonResponse({
      success: false,
      message: "این شماره قبلاً ثبت شده است؛ برای ادامه وارد شوید.",
    }, 409);
  }

  return requestOtpForPhone({
    db: env.DB,
    env,
    request,
    phone,
    user,
    now: Date.now(),
  });
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new AuthError("شماره همراه ایرانی معتبر وارد کنید.", 400);

  const user = await getUserByPhone(env.DB, phone);
  if (!user) {
    return jsonResponse({
      success: false,
      registration_required: true,
      message: "برای این شماره حسابی پیدا نشد؛ ابتدا ثبت‌نام کنید.",
    }, 404);
  }

  const provider = getOtpProvider(request, env, phone);
  if (provider instanceof UnconfiguredOTPProvider) {
    throw new AuthError("ارسال کد تأیید هنوز برای این محیط پیکربندی نشده است.", 503);
  }

  return requestOtpForPhone({
    db: env.DB,
    env,
    request,
    phone,
    user,
    now: Date.now(),
  });
}

async function handleOtpRequest(request, env) {
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new AuthError("شماره همراه ایرانی معتبر وارد کنید.", 400);

  const user = await getUserByPhone(env.DB, phone);
  return requestOtpForPhone({
    db: env.DB,
    env,
    request,
    phone,
    user,
    now: Date.now(),
  });
}

async function handleOtpVerify(request, env) {
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!phone || !/^\d{6}$/.test(code)) {
    throw new AuthError("شماره همراه یا کد تأیید معتبر نیست.", 400);
  }

  const secret = getAuthSecret(env);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const challenge = await env.DB.prepare(
    "SELECT id, user_id, code_hash, expires_at, attempts FROM otp_challenges WHERE phone = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
  ).bind(phone).first();

  if (!challenge) throw new AuthError("کد تأیید معتبر یا فعال نیست.", 401);
  if (Date.parse(challenge.expires_at) <= now) {
    await env.DB.prepare(
      "UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
    ).bind(nowIso, challenge.id).run();
    throw new AuthError("مهلت کد تأیید به پایان رسیده است؛ کد تازه‌ای درخواست کنید.", 401);
  }
  if (Number(challenge.attempts) >= OTP_MAX_ATTEMPTS) {
    throw new AuthError("تعداد تلاش‌های مجاز به پایان رسیده است؛ کد تازه‌ای درخواست کنید.", 429);
  }

  const attempt = await env.DB.prepare(
    "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < ? RETURNING user_id, code_hash, attempts",
  ).bind(challenge.id, nowIso, OTP_MAX_ATTEMPTS).first();
  if (!attempt) throw new AuthError("کد تأیید معتبر یا فعال نیست.", 401);

  const submittedCodeHash = await hmacHex(secret, `otp:${challenge.id}:${code}`);
  if (!constantTimeEqual(submittedCodeHash, attempt.code_hash)) {
    if (Number(attempt.attempts) >= OTP_MAX_ATTEMPTS) {
      throw new AuthError("تعداد تلاش‌های مجاز به پایان رسیده است؛ کد تازه‌ای درخواست کنید.", 429);
    }
    throw new AuthError("کد تأیید اشتباه است.", 401);
  }

  const consumed = await env.DB.prepare(
    "UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts <= ? RETURNING user_id",
  ).bind(nowIso, challenge.id, attempt.user_id, nowIso, OTP_MAX_ATTEMPTS).first();
  if (!consumed) throw new AuthError("کد تأیید معتبر یا فعال نیست.", 401);

  const user = await env.DB.prepare(
    "SELECT id, phone, first_name, last_name FROM users WHERE id = ?",
  ).bind(consumed.user_id).first();
  if (!user) throw new AuthError("کاربر پیدا نشد.", 401);

  const token = randomToken();
  const tokenHash = await hmacHex(secret, `session:${token}`);
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run();

  return jsonResponse({
    success: true,
    authenticated: true,
    user,
  }, 200, {
    "set-cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)),
  });
}

async function handleMe(request, env) {
  const token = cookieValue(request);
  if (!token || token.length > 256) {
    return jsonResponse({ success: true, authenticated: false });
  }

  const secret = getAuthSecret(env);
  const tokenHash = await hmacHex(secret, `session:${token}`);
  const now = new Date().toISOString();
  const user = await env.DB.prepare(`
    SELECT users.id, users.first_name, users.last_name, users.phone
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!user) {
    await env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?",
    ).bind(tokenHash, now).run();
    return jsonResponse({ success: true, authenticated: false });
  }

  return jsonResponse({ success: true, authenticated: true, user });
}

async function getSessionUser(request, env) {
  const token = cookieValue(request);
  if (!token || token.length > 256) {
    throw new AuthError("برای ادامه وارد حساب کاربری شوید.", 401);
  }
  const tokenHash = await hmacHex(getAuthSecret(env), `session:${token}`);
  const now = new Date().toISOString();
  const user = await env.DB.prepare(`
    SELECT users.id, users.first_name, users.last_name, users.phone
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();
  if (!user) throw new AuthError("نشست کاربری معتبر نیست.", 401);
  return user;
}

function validateAccountData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AuthError("ساختار اطلاعات حساب معتبر نیست.", 400);
  }
  const collections = ["cars", "services", "reminders", "catalog", "maintenance"];
  const allowedKeys = new Set([...collections, "settings"]);
  if (Object.keys(data).some((key) => !allowedKeys.has(key))) {
    throw new AuthError("ساختار اطلاعات حساب معتبر نیست.", 400);
  }
  for (const key of collections) {
    if (!Array.isArray(data[key]) || data[key].length > 10000) {
      throw new AuthError("فهرست اطلاعات حساب معتبر نیست.", 400);
    }
    const ids = new Set();
    for (const item of data[key]) {
      if (!item || typeof item !== "object" || Array.isArray(item)
        || typeof item.id !== "string" || !item.id || item.id.length > 200
        || ids.has(item.id)) {
        throw new AuthError("یکی از رکوردهای اطلاعات حساب معتبر نیست.", 400);
      }
      ids.add(item.id);
    }
  }
  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    throw new AuthError("تنظیمات حساب معتبر نیست.", 400);
  }
  if (Object.keys(data.settings).some((key) => key !== "theme")) {
    throw new AuthError("تنظیمات حساب معتبر نیست.", 400);
  }
  const theme = data.settings.theme;
  if (theme !== undefined && !["auto", "light", "dark"].includes(theme)) {
    throw new AuthError("پوسته انتخاب‌شده معتبر نیست.", 400);
  }
  return data;
}

function mergeAccountData(current, incoming) {
  const merged = {};
  for (const key of ["cars", "services", "reminders", "catalog", "maintenance"]) {
    const records = new Map(current[key].map((item) => [item.id, item]));
    incoming[key].forEach((item) => records.set(item.id, item));
    merged[key] = [...records.values()];
  }
  merged.settings = { ...current.settings, ...incoming.settings };
  return merged;
}

async function readAccountData(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AuthError("درخواست باید از نوع JSON باشد.", 415);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > ACCOUNT_DATA_MAX_BYTES) {
    throw new AuthError("حجم اطلاعات حساب بیش از حد مجاز است.", 413);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > ACCOUNT_DATA_MAX_BYTES) {
    throw new AuthError("حجم اطلاعات حساب بیش از حد مجاز است.", 413);
  }
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new AuthError("بدنهٔ درخواست معتبر نیست.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AuthError("بدنهٔ درخواست معتبر نیست.", 400);
  }
  return body;
}

async function handleAccountDataGet(request, env) {
  const user = await getSessionUser(request, env);
  const row = await env.DB.prepare(
    "SELECT payload FROM account_data WHERE user_id = ?",
  ).bind(user.id).first();
  let data = null;
  if (row) {
    try {
      data = validateAccountData(JSON.parse(row.payload));
    } catch (error) {
      if (error instanceof AuthError) throw error;
      console.error("Stored account data could not be parsed.");
      throw new AuthError("اطلاعات ذخیره‌شدهٔ حساب قابل خواندن نیست.", 500);
    }
  }
  return jsonResponse({ success: true, data });
}

async function handleAccountDataPut(request, env) {
  const user = await getSessionUser(request, env);
  const body = await readAccountData(request);
  const incoming = validateAccountData(body.data);
  if (body.mode !== "replace" && body.mode !== "merge") {
    throw new AuthError("روش همگام‌سازی معتبر نیست.", 400);
  }
  const incomingSize = new TextEncoder().encode(JSON.stringify(incoming)).length;
  if (incomingSize > ACCOUNT_DATA_MAX_BYTES) {
    throw new AuthError("حجم اطلاعات حساب بیش از حد مجاز است.", 413);
  }
  let data = incoming;

  if (body.mode === "merge") {
    const row = await env.DB.prepare(
      "SELECT payload FROM account_data WHERE user_id = ?",
    ).bind(user.id).first();
    if (row) {
      let existing;
      try {
        existing = validateAccountData(JSON.parse(row.payload));
      } catch (error) {
        if (error instanceof AuthError) throw error;
        console.error("Stored account data could not be parsed.");
        throw new AuthError("اطلاعات ذخیره‌شدهٔ حساب قابل خواندن نیست.", 500);
      }
      data = mergeAccountData(existing, incoming);
    }
  }

  const payload = JSON.stringify(data);
  if (new TextEncoder().encode(payload).length > ACCOUNT_DATA_MAX_BYTES) {
    throw new AuthError("حجم اطلاعات حساب بیش از حد مجاز است.", 413);
  }
  await env.DB.prepare(`
    INSERT INTO account_data (user_id, payload)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(user.id, payload).run();
  return jsonResponse({ success: true, data });
}

async function handleLogout(request, env) {
  const token = cookieValue(request);
  if (token && token.length <= 256) {
    const secret = getAuthSecret(env);
    const tokenHash = await hmacHex(secret, `session:${token}`);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(tokenHash).run();
  }

  return jsonResponse({ success: true }, 200, {
    "set-cookie": sessionCookie("", 0),
  });
}

async function handleAuthRequest(request, env) {
  try {
    const { pathname } = new URL(request.url);
    const routes = {
      "/api/auth/register": ["POST", handleRegister],
      "/api/auth/login": ["POST", handleLogin],
      "/api/auth/otp/request": ["POST", handleOtpRequest],
      "/api/auth/otp/verify": ["POST", handleOtpVerify],
      "/api/auth/logout": ["POST", handleLogout],
      "/api/auth/me": ["GET", handleMe],
    };
    const methodRoutes = {
      "/api/account/data": {
        GET: handleAccountDataGet,
        PUT: handleAccountDataPut,
      },
    };
    const route = methodRoutes[pathname]
      ? [request.method, methodRoutes[pathname][request.method]]
      : routes[pathname];

    if (!route) return jsonResponse({ success: false, message: "Not found." }, 404);
    if (route.length < 2 || typeof route[1] !== "function") {
      const allowed = methodRoutes[pathname]
        ? Object.keys(methodRoutes[pathname]).join(", ")
        : route[0];
      return new Response(null, {
        status: 405,
        headers: { allow: allowed },
      });
    }
    if (request.method !== route[0]) {
      return new Response(null, {
        status: 405,
        headers: { allow: route[0] },
      });
    }

    return await route[1](request, env);
  } catch (error) {
    if (!(error instanceof AuthError)) console.error("Authentication request failed.");
    return authErrorResponse(error);
  }
}

export { handleAuthRequest, isLocalHost };
