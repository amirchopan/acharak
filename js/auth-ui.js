import {
  getAuthState,
  loginWithPhone,
  registerWithPhone,
  requestOtp,
  verifyOtp,
} from "./auth.js";
import { navigate } from "./router.js";
import { acIcon, escapeHtml, toEnDigits, toFaDigits } from "./utils.js";

let pendingPhone = "";
let pendingOtpResponse = null;
let resendTimer = null;

function phoneDigits(value) {
  return toEnDigits(value).replace(/\D/g, "");
}

function normalizePhoneForDisplay(value) {
  const digits = phoneDigits(value);
  if (digits.startsWith("0098")) return digits.slice(2);
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  return digits;
}

function stopResendTimer() {
  if (resendTimer) {
    clearInterval(resendTimer);
    resendTimer = null;
  }
}

function setFormBusy(form, busy) {
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = busy;
  submitButton.textContent = busy ? "لطفاً صبر کنید…" : submitButton.dataset.label;
}

function showFormError(form, message) {
  const error = form.querySelector(".auth-form__error");
  error.textContent = message;
  error.hidden = !message;
}

function authPageShell({ eyebrow, title, subtitle, content, backHref = "#/settings/account" }) {
  document.getElementById("tab-bar")?.remove();
  document.getElementById("fab")?.remove();
  return `
    <main class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <a href="${backHref}" class="page-header__back sf auth-page__back" aria-label="بازگشت">${acIcon("chevron-right")}</a>
        <p class="auth-card__eyebrow">${eyebrow}</p>
        <h1 id="auth-title">${title}</h1>
        <p class="auth-card__subtitle">${subtitle}</p>
        ${content}
      </section>
    </main>`;
}

function startOtpPage(root, response) {
  stopResendTimer();
  const developmentCode = response.development_otp;
  root.innerHTML = authPageShell({
    eyebrow: "تأیید شماره همراه",
    title: "کد تأیید را وارد کنید",
    subtitle: `کد تأیید برای شماره <bdi dir="ltr">${escapeHtml(toFaDigits(pendingPhone))}</bdi> ارسال شد.`,
    backHref: "#/login",
    content: `
      <form class="form-stack auth-form" id="otp-form" novalidate>
        <div class="field">
          <label for="otp-code">کد یک‌بارمصرف</label>
          <input class="text-input auth-otp-input" id="otp-code" name="code" type="text"
            inputmode="numeric" autocomplete="one-time-code" pattern="[0-9۰-۹٠-٩]{6}"
            maxlength="6" placeholder="------" dir="ltr" required />
        </div>
        <p class="auth-form__error" role="alert" hidden></p>
        ${developmentCode ? `<p class="auth-development-code" role="status">کد آزمایشی محلی: <bdi dir="ltr">${escapeHtml(toFaDigits(developmentCode))}</bdi></p>` : ""}
        <button class="btn btn--primary btn--block" type="submit" data-label="تأیید">تأیید</button>
      </form>
      <div class="auth-otp-actions">
        <button class="auth-link" type="button" id="resend-otp" disabled>ارسال دوباره کد</button>
        <span class="auth-resend-countdown" id="resend-countdown" aria-live="polite"></span>
      </div>
      <button class="auth-link auth-link--secondary" type="button" id="change-phone">تغییر شماره همراه</button>`,
  });

  const form = root.querySelector("#otp-form");
  const codeInput = root.querySelector("#otp-code");
  const resendButton = root.querySelector("#resend-otp");
  const countdown = root.querySelector("#resend-countdown");
  const resendAfter = Math.max(1, Number(response.resend_after_seconds) || 60);
  let remaining = resendAfter;

  const renderCountdown = () => {
    if (remaining <= 0) {
      resendButton.disabled = false;
      countdown.textContent = "";
      stopResendTimer();
      return;
    }
    resendButton.disabled = true;
    countdown.textContent = `${toFaDigits(remaining)} ثانیه`;
    remaining -= 1;
  };

  renderCountdown();
  resendTimer = setInterval(renderCountdown, 1000);

  codeInput.addEventListener("input", () => {
    codeInput.value = phoneDigits(codeInput.value).slice(0, 6);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(form, "");
    if (phoneDigits(codeInput.value).length !== 6) {
      showFormError(form, "کد تأیید باید ۶ رقم باشد.");
      return;
    }

    setFormBusy(form, true);
    try {
      await verifyOtp(pendingPhone, phoneDigits(codeInput.value));
      pendingPhone = "";
      pendingOtpResponse = null;
      stopResendTimer();
      navigate("#/dashboard");
    } catch (error) {
      showFormError(form, error.message);
      if (error.status === 429 && error.retryAfterSeconds) {
        stopResendTimer();
        remaining = error.retryAfterSeconds;
        renderCountdown();
        resendTimer = setInterval(renderCountdown, 1000);
      }
    } finally {
      setFormBusy(form, false);
    }
  });

  resendButton.addEventListener("click", async () => {
    resendButton.disabled = true;
    showFormError(form, "");
    try {
      const result = await requestOtp(pendingPhone);
      startOtpPage(root, result);
    } catch (error) {
      showFormError(form, error.message);
      if (error.status === 429 && error.retryAfterSeconds) {
        stopResendTimer();
        remaining = error.retryAfterSeconds;
        renderCountdown();
        resendTimer = setInterval(renderCountdown, 1000);
      } else {
        resendButton.disabled = false;
      }
    }
  });

  root.querySelector("#change-phone").addEventListener("click", () => {
    pendingPhone = "";
    pendingOtpResponse = null;
    stopResendTimer();
    navigate("#/login");
  });

  codeInput.focus();
  return stopResendTimer;
}

function renderRegisterPage(params, root) {
  stopResendTimer();
  if (getAuthState().authenticated) {
    navigate("#/dashboard");
    return;
  }

  root.innerHTML = authPageShell({
    eyebrow: "حساب کاربری آچارک",
    title: "ساخت حساب کاربری",
    subtitle: "برای ادامه، نام و شماره همراه خود را وارد کنید.",
    content: `
      <form class="form-stack auth-form" id="register-form" novalidate>
        <div class="field">
          <label for="first-name">نام</label>
          <input class="text-input" id="first-name" name="first_name" type="text"
            autocomplete="given-name" maxlength="80" required />
        </div>
        <div class="field">
          <label for="last-name">نام خانوادگی <span>(اختیاری)</span></label>
          <input class="text-input" id="last-name" name="last_name" type="text"
            autocomplete="family-name" maxlength="80" />
        </div>
        <div class="field">
          <label for="register-phone">شماره همراه</label>
          <input class="text-input" id="register-phone" name="phone" type="tel"
            inputmode="tel" autocomplete="tel-national" maxlength="18" placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            dir="ltr" required />
        </div>
        <p class="auth-form__error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block" type="submit" data-label="ادامه">ادامه</button>
      </form>
      <p class="auth-switch">قبلاً حساب ساخته‌اید؟ <a href="#/login">ورود</a></p>`,
  });

  const form = root.querySelector("#register-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(form, "");
    const values = new FormData(form);
    const firstName = String(values.get("first_name") || "").trim();
    const lastName = String(values.get("last_name") || "").trim();
    const phone = normalizePhoneForDisplay(values.get("phone"));

    if (!firstName || !/^09\d{9}$/.test(phone)) {
      showFormError(form, "نام و یک شماره همراه معتبر وارد کنید.");
      return;
    }

    setFormBusy(form, true);
    try {
      const response = await registerWithPhone({
        first_name: firstName,
        last_name: lastName,
        phone,
      });
      pendingPhone = phone;
      pendingOtpResponse = response;
      navigate("#/otp");
    } catch (error) {
      showFormError(
        form,
        error.status === 409
          ? "این شماره قبلاً ثبت شده است؛ لطفاً وارد شوید."
          : error.message,
      );
    } finally {
      setFormBusy(form, false);
    }
  });
}

function renderLoginPage(params, root) {
  stopResendTimer();
  if (getAuthState().authenticated) {
    navigate("#/dashboard");
    return;
  }

  root.innerHTML = authPageShell({
    eyebrow: "خوش آمدید",
    title: "ورود به آچارک",
    subtitle: "برای دریافت کد تأیید، شماره همراه خود را وارد کنید.",
    content: `
      <form class="form-stack auth-form" id="login-form" novalidate>
        <div class="field">
          <label for="login-phone">شماره همراه</label>
          <input class="text-input" id="login-phone" name="phone" type="tel"
            inputmode="tel" autocomplete="tel-national" maxlength="18" placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            dir="ltr" required />
        </div>
        <p class="auth-form__error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block" type="submit" data-label="ادامه">ادامه</button>
      </form>
      <p class="auth-switch">حساب کاربری ندارید؟ <a href="#/register">ثبت‌نام</a></p>`,
  });

  const form = root.querySelector("#login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(form, "");
    const phone = normalizePhoneForDisplay(new FormData(form).get("phone"));
    if (!/^09\d{9}$/.test(phone)) {
      showFormError(form, "شماره همراه معتبر وارد کنید.");
      return;
    }

    setFormBusy(form, true);
    try {
      const response = await loginWithPhone({ phone });
      pendingPhone = phone;
      pendingOtpResponse = response;
      navigate("#/otp");
    } catch (error) {
      showFormError(form, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function renderOtpPage(params, root) {
  stopResendTimer();
  if (!pendingPhone) {
    navigate("#/login");
    return;
  }
  const response = pendingOtpResponse || { resend_after_seconds: 1 };
  pendingOtpResponse = null;
  const stopTimer = startOtpPage(root, response);
  return () => {
    stopTimer();
    pendingPhone = "";
    pendingOtpResponse = null;
  };
}

export { renderLoginPage, renderOtpPage, renderRegisterPage };
