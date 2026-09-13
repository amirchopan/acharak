/**
 * app.js
 * نقطه ورود اپلیکیشن: مقداردهی اولیه، مدیریت تم، ثبت Service Worker،
 * تعریف مسیرها و رندر تمام صفحات برنامه.
 */

import { registerRoute, initRouter, navigate } from "./router.js";
import {
  CarsAPI,
  ServicesAPI,
  RemindersAPI,
  CatalogAPI,
  MaintenanceAPI,
  SettingsAPI,
  REMINDER_TITLES,
  DEFAULT_PARTS,
} from "./database.js";
import { downloadBackupFile, importFromFile } from "./storage.js";
import {
  showToast,
  showAlert,
  openSheet,
  createSegmentedControl,
  createCombobox,
  openJalaliDatePicker,
  createIranPlateWidget,
  createCarCard,
  createServiceCard,
  createServiceCompactRow,
  createServiceTimelineItem,
  openServiceReceipt,
  openInsuranceReceipt,
  renderTabBar,
  renderFab,
  removeFab,
  createPhotoPicker,
  createPhotoGallery,
  createIranPlateDisplay,
} from "./components.js";
import {
  toFaDigits,
  toEnDigits,
  formatNumberFa,
  formatToman,
  formatKm,
  todayJalaliStr,
  jalaliStrToDate,
  generateId,
  calcMonthlyFromDaily,
  readImageAsDataURL,
  escapeHtml,
  isPlateComplete,
  isPlatePartial,
  formatPlate,
  acIcon,
  bindThousandsInput,
  addOneJalaliYear,
  addOneJalaliYearMinusOneDay,
  daysUntilJalali,
} from "./utils.js";

/* ==================== داده‌های پایه (قابل ویرایش) ==================== */

/** فهرست خودرو به تفکیک برند و مدل - کاربر می‌تواند این فهرست را گسترش دهد */
/** کاتالوگ برند/سری/مدل — از assets/data/cars.json بارگذاری می‌شود */
let CAR_CATALOG = {};

async function loadCarCatalog() {
  try {
    const res = await fetch("./assets/data/cars.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data && typeof data === "object") {
      CAR_CATALOG = data;
    }
  } catch (err) {
    console.error("خطا در بارگذاری cars.json", err);
    showToast("لیست خودروها بارگذاری نشد", "error");
  }
}

function isCatalogGroup(node) {
  return node && typeof node === "object" && !Array.isArray(node);
}

/** [{ series, model }] برای یک برند */
function flattenBrandModels(brand) {
  const entry = CAR_CATALOG[brand];
  if (!entry) return [];
  if (Array.isArray(entry)) {
    return entry.map((model) => ({ series: null, model }));
  }
  if (isCatalogGroup(entry)) {
    return Object.entries(entry).flatMap(([series, models]) => {
      if (typeof models === "string") {
        return [{ series, model: models }];
      }
      if (Array.isArray(models)) {
        if (models.length === 1) {
          return [{ series, model: models[0] }];
        }
        return models.map((model) => ({ series, model }));
      }
      return [];
    });
  }
  return [];
}

/** لیست نمایشی برای combobox مدل یک برند */
function brandModelLabels(brand) {
  return flattenBrandModels(brand).map(({ series, model }) => ({
    value: model,
    label: series ? `${series} · ${model}` : model,
    series,
  }));
}

const CAR_COLORS = [
  { name: "سفید", hex: "#F5F5F5" },
  { name: "مشکی", hex: "#1C1C1E" },
  { name: "نقره‌ای", hex: "#C0C0C8" },
  { name: "خاکستری", hex: "#8E8E93" },
  { name: "قرمز", hex: "#FF3B30" },
  { name: "آبی", hex: "#0A84FF" },
  { name: "سرمه‌ای", hex: "#1E3A5F" },
  { name: "قهوه‌ای", hex: "#6B4423" },
  { name: "زرد", hex: "#FFD60A" },
  { name: "سبز", hex: "#34C759" },
  { name: "نارنجی", hex: "#FF9500" },
  { name: "بژ", hex: "#D9C6A5" },
];

/** رنگ وضعیت خدمات سرویس — بر پایه سیستم رنگ تک‌رنگ + وضعیت‌های success/warning — قابل گسترش */
const SERVICE_STATUS_COLORS = {
  // ✅ سبز (success) — انجام موفق / تعویض / تکمیل شده
  "تعویض شد":   { bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },
  "انجام شد":   { bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },
  "تعمیر شد":   { bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },
  "تعویض":      { bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },

  // 🟠 کهربایی (warning) — نیاز به توجه / بازدید
  "بازدید شد":  { bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },
  "بازدید":     { bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },
  "باد معمولی": { bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },

  // ⚫ مشکی خنثی — اضافه کردن / شارژ / اقدام کمکی (بدون رنگ برند)
  "اضافه شد":   { bg: "rgba(0, 0, 0, 0.08)",  fg: "#1a1a1a" },
  "شارژ شد":    { bg: "rgba(0, 0, 0, 0.08)",  fg: "#1a1a1a" },
  "نیتروژن":    { bg: "rgba(0, 0, 0, 0.08)",  fg: "#1a1a1a" },

  // ⚫ خاکستری تیره — عملیات نظافت / شستشو
  "شستشو":      { bg: "rgba(94, 94, 94, 0.16)", fg: "#3d3d3d" },

  // ⚪ خاکستری میانه — تعداد / کمیت
  "4 حلقه":     { bg: "rgba(120, 128, 130, 0.18)", fg: "#55595a" },
  "2 حلقه":     { bg: "rgba(120, 128, 130, 0.18)", fg: "#55595a" },

  // ⚪ خاکستری — پیش‌فرض / ناشناخته
  _default:     { bg: "rgba(120, 120, 120, 0.16)", fg: "#5e5e5e" },
};

function getServiceStatusColor(status) {
  if (!status) return SERVICE_STATUS_COLORS._default;
  return SERVICE_STATUS_COLORS[status] || SERVICE_STATUS_COLORS._default;
}

function statusPillHtml(status) {
  const c = getServiceStatusColor(status);
  return `<span class="status-pill" style="background:${c.bg};color:${c.fg}">${escapeHtml(status || "")}</span>`;
}

const FUEL_TYPES = ["بنزین", "دوگانه‌سوز (CNG)", "دیزل", "هیبرید", "برقی"];
const INSPECTION_NOTIFY_OPTIONS = [
  { value: "day1", label: "۱ روز قبل" },
  { value: "week1", label: "۱ هفته قبل" },
  { value: "week2", label: "۲ هفته قبل" },
  { value: "month1", label: "۱ ماه قبل" },
];
const INS_PAYMENT_ROWS = [
  { key: "cash", label: "نقد" },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: `inst${index + 1}`,
    label: `قسط ${toFaDigits(index + 1)}`,
  })),
];

function createEmptyInsurance() {
  return {
    fromDate: "",
    toDate: "",
    payments: Object.fromEntries(
      INS_PAYMENT_ROWS.map(({ key }) => [key, { amount: "", date: "", paid: false }]),
    ),
  };
}

/* ==================== مدیریت تم ==================== */

async function applyTheme(mode) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  if (mode === "light") root.classList.add("theme-light");
  else if (mode === "dark") root.classList.add("theme-dark");
  // در حالت auto از prefers-color-scheme سیستم پیروی می‌کنیم (بدون کلاس اضافه)
}

async function initTheme() {
  const saved = await SettingsAPI.get("theme", "auto");
  await applyTheme(saved);
  return saved;
}

async function setTheme(mode) {
  await SettingsAPI.set("theme", mode);
  await applyTheme(mode);
}

/* ==================== Service Worker ==================== */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // خطای ثبت service worker بی‌صدا نادیده گرفته می‌شود (مثلا در حالت توسعه محلی بدون https)
      });
    });
  }
}

/* ==================== نصب PWA ==================== */

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

/* ==================== شروع برنامه ==================== */

async function bootstrap() {
  await initTheme();
  await loadCarCatalog(); // قبل از روت‌ها
  registerServiceWorker();
  registerAllRoutes();
  initRouter();
}

document.addEventListener("DOMContentLoaded", bootstrap);
if (document.readyState !== "loading") bootstrap();

/* ==================== ثبت مسیرها ==================== */

function registerAllRoutes() {
  registerRoute("#/dashboard", renderDashboardPage);
  registerRoute("#/cars", renderCarsListPage);
  registerRoute("#/cars/new", renderCarFormPage);
  registerRoute("#/cars/:id/edit", renderCarFormPage);
  registerRoute("#/services", renderServicesListPage);
  registerRoute("#/services/new", renderServiceFormPage);
  registerRoute("#/services/:id/edit", renderServiceFormPage);
  registerRoute("#/maintenance", renderMaintenancePage);
  registerRoute("#/settings", renderSettingsPage);
}

/* ==================================================
   نگهداری قطعات — توابع مشترک
   ================================================== */

/** محاسبه وضعیت عمر قطعه نسبت به کیلومتر فعلی */
function computePartGauge(currentKm, replacedKm, lifeKm) {
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const cur = toNum(currentKm);
  const rep = toNum(replacedKm);
  const life = toNum(lifeKm);
  if (life <= 0) return { hasData: false };

  if (rep > cur && cur > 0) {
    return {
      hasData: true,
      usedPercent: 0,
      displayPercent: 0,
      remainingKm: Math.round(life),
      overdueKm: 0,
      usedKm: 0,
      lifeKm: Math.round(life),
      level: "ok",
      overdue: false,
    };
  }

  const usedKm = Math.max(0, cur - rep);
  let usedRatio = usedKm / life;
  if (!Number.isFinite(usedRatio) || usedRatio < 0) usedRatio = 0;

  const rawPercent = Math.round(usedRatio * 100);
  const overdue = usedRatio >= 1;
  const remainingKm = Math.max(0, Math.round(life - usedKm));
  const overdueKm = overdue ? Math.round(usedKm - life) : 0;

  let level = "ok";
  if (overdue) level = "critical";
  else if (usedRatio >= 0.85) level = "warn";
  else if (usedRatio >= 0.7) level = "caution";

  return {
    hasData: true,
    usedPercent: Math.min(rawPercent, 100), // هرگز بالای ۱۰۰٪
    displayPercent: Math.min(rawPercent, 100),
    remainingKm,
    overdueKm,
    usedKm: Math.round(usedKm),
    lifeKm: Math.round(life),
    level,
    overdue,
  };
}

function partLevelLabel(level) {
  if (level === "critical") return "نیاز به تعویض";
  if (level === "warn") return "نزدیک به تعویض";
  if (level === "caution") return "نیاز به توجه";
  return "سالم";
}

/** نوار پیشرفت خطی HTML */
function renderLinearBarHtml(title, gauge, extraSub = "") {
  if (!gauge || !gauge.hasData) {
    return `
      <div class="maint-bar maint-bar--empty">
        <div class="maint-bar__head">
          <span class="maint-bar__title">${escapeHtml(title)}</span>
          <span class="maint-bar__meta">ثبت نشده</span>
        </div>
        <div class="maint-bar__track"><div class="maint-bar__fill" style="width:0%"></div></div>
      </div>`;
  }
  const pct = gauge.displayPercent;
  const sub =
    extraSub ||
    (gauge.overdue
      ? `نیاز به تعویض · ${formatKm(gauge.overdueKm)} گذشته`
      : `باقی‌مانده: ${formatKm(gauge.remainingKm)}`);
  return `
    <div class="maint-bar maint-bar--${gauge.level}">
      <div class="maint-bar__head">
        <span class="maint-bar__title">${escapeHtml(title)}</span>
        <span class="maint-bar__pct">${toFaDigits(gauge.usedPercent)}٪</span>
      </div>
      <div class="maint-bar__track">
        <div class="maint-bar__fill" style="width:${pct}%"></div>
      </div>
      <p class="maint-bar__sub">${escapeHtml(sub)}</p>
    </div>`;
}

/** گیج دایره‌ای SVG */
function renderCircleGaugeHtml(title, gauge, metaLine = "") {
  const r = 36;
  const c = 2 * Math.PI * r;
  const pct = gauge && gauge.hasData ? gauge.displayPercent : 0;
  const offset = c - (pct / 100) * c;
  const level = gauge && gauge.hasData ? gauge.level : "empty";
  const centerText =
    gauge && gauge.hasData
      ? `${toFaDigits(Math.min(gauge.usedPercent, 100))}٪`
      : "—";
  const sub =
    gauge && gauge.hasData
      ? gauge.overdue
        ? `نیاز به تعویض · ${formatKm(gauge.overdueKm)} گذشته`
        : `باقی‌مانده ${formatKm(gauge.remainingKm)}`
      : "ثبت نشده";
  return `
    <div class="maint-gauge-card card">
      <div class="maint-gauge-card__ring-wrap">
        <svg class="maint-gauge-card__svg" viewBox="0 0 88 88" aria-hidden="true">
          <circle class="maint-gauge-card__track" cx="44" cy="44" r="${r}" />
          <circle class="maint-gauge-card__fill maint-gauge-card__fill--${level}"
            cx="44" cy="44" r="${r}"
            stroke-dasharray="${c.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
            transform="rotate(-90 44 44)" />
        </svg>
        <span class="maint-gauge-card__center">${centerText}</span>
      </div>
      <div class="maint-gauge-card__info">
        <h3 class="maint-gauge-card__title">${escapeHtml(title)}</h3>
        <p class="maint-gauge-card__sub">${escapeHtml(sub)}</p>
        ${metaLine ? `<p class="maint-gauge-card__meta">${metaLine}</p>` : ""}
      </div>
    </div>`;
}

/**
 * همگام‌سازی تعویض روغن سرویس با لیست نگهداری
 * اگر روغن انجام شده باشد، آخرین رکورد engine-oil را به‌روز/ایجاد می‌کند
 */
async function syncOilMaintenanceFromService(service) {
  if (!service || !service.oilChange || !service.oilChange.done) return;
  const oil = service.oilChange;
  const replacedKm = Number(service.km) || 0;
  if (!replacedKm) return;

  let lifeKm = Number(oil.mileage) || 0;
  const nextKm = Number(oil.nextKm) || 0;
  if (!lifeKm && nextKm > replacedKm) lifeKm = nextKm - replacedKm;
  if (!lifeKm) {
    const def = DEFAULT_PARTS.find((p) => p.id === "engine-oil");
    lifeKm = def ? def.defaultLifeKm : 5000;
  }

  const latest = await MaintenanceAPI.getLatestByCarId(service.carId);
  const existing = latest["engine-oil"];

  // اگر رکورد موجود با کیلومتر بالاتر یا مساوی باشد و از سرویس دیگری آمده، رد نکن مگر کیلومتر جدیدتر
  if (existing && Number(existing.replacedKm) > replacedKm) return;
  if (
    existing &&
    Number(existing.replacedKm) === replacedKm &&
    existing.source === "service" &&
    existing.serviceId === service.id
  ) {
    // همان سرویس — به‌روزرسانی فیلدها
    existing.lifeKm = lifeKm;
    existing.replacedDate = service.date || existing.replacedDate;
    existing.title = "روغن موتور";
    existing.note = oil.oilName
      ? `نام روغن: ${oil.oilName}${oil.grade ? " · " + oil.grade : ""}`
      : existing.note || "";
    existing.updatedAt = new Date().toISOString();
    await MaintenanceAPI.save(existing);
    return;
  }

  const record = {
    id:
      existing && Number(existing.replacedKm) === replacedKm
        ? existing.id
        : generateId(),
    carId: service.carId,
    partId: "engine-oil",
    title: "روغن موتور",
    replacedKm,
    replacedDate: service.date || todayJalaliStr(),
    lifeKm,
    note: oil.oilName
      ? `نام روغن: ${oil.oilName}${oil.grade ? " · " + oil.grade : ""}`
      : "",
    source: "service",
    serviceId: service.id,
    createdAt:
      existing && Number(existing.replacedKm) === replacedKm
        ? existing.createdAt
        : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await MaintenanceAPI.save(record);
}

/* ==================================================
   صفحه داشبورد
   ================================================== */

async function renderDashboardPage(params, root) {
  renderTabBar("#/dashboard");
  const cars = await CarsAPI.getAll();
  const allServices = await ServicesAPI.getAll();

  if (!cars.length) {
    root.innerHTML = `
      <header class="page-header"><h1>داشبورد</h1></header>
      <div class="empty-state">
        <span class="empty-state__icon sf">${acIcon("car-front")}</span>
        <h2>هنوز خودرویی ثبت نشده</h2>
        <p>برای شروع، اولین خودروی خود را اضافه کنید.</p>
        <a href="#/cars/new" class="btn btn--primary">افزودن خودرو</a>
      </div>`;
    removeFab();
    return;
  }

  let activeCarId =
    window.__dashboardActiveCarId &&
    cars.some((c) => c.id === window.__dashboardActiveCarId)
      ? window.__dashboardActiveCarId
      : cars[0].id;

  root.innerHTML = `
    <header class="page-header"><h1>داشبورد</h1></header>
    <section class="dash-car-strip"></section>
    <section class="dash-summary card"></section>
    <section class="dash-docs" id="dash-docs"></section>
    <section class="dash-maintenance card" id="dash-maintenance"></section>
    <section class="dash-quick">
      <div class="dash-quick__buttons"></div>
    </section>
    <section class="dash-recent">
      <div class="section-header">
        <h2>سرویس‌های اخیر</h2>
      </div>
      <div class="dash-recent__list"></div>
    </section>
  `;

  const strip = root.querySelector(".dash-car-strip");
  const summary = root.querySelector(".dash-summary");
  const maintSection = root.querySelector("#dash-maintenance");
  const quickButtons = root.querySelector(".dash-quick__buttons");
  const recentList = root.querySelector(".dash-recent__list");
  let maintExpanded = false;

  function dashboardCarModel(car) {
    if (car.model) return car.model;
    const brandModel = String(car.brandModel || "");
    return brandModel.includes(" - ") ? brandModel.split(" - ").slice(1).join(" - ") : brandModel;
  }

  function renderStrip() {
    strip.innerHTML = "";
    cars.forEach((car) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "dash-car-chip" + (car.id === activeCarId ? " is-active" : "");
      chip.innerHTML = `
        <span class="dash-car-chip__name">${escapeHtml(dashboardCarModel(car) || "خودرو")}</span>`;
      chip.addEventListener("click", () => {
        activeCarId = car.id;
        window.__dashboardActiveCarId = car.id;
        renderStrip();
        renderSummary();
        renderDocs();
        renderMaintenanceSection();
        renderRecent();
      });
      strip.appendChild(chip);
    });
  }

  function renderSummary() {
    const car = cars.find((c) => c.id === activeCarId);
    if (!car) return;
    const carServices = allServices.filter((s) => s.carId === car.id);
    const totalCost = carServices.reduce(
      (sum, s) => sum + (Number(s.totalCost) || 0),
      0,
    );
    const lastOil = [...carServices]
      .filter((s) => s.oilChange && s.oilChange.done)
      .sort(
        (a, b) =>
          (jalaliStrToDate(b.date) || 0) - (jalaliStrToDate(a.date) || 0),
      )[0];

    function computeOilGauge(car, lastOilService) {
      if (!lastOilService || !lastOilService.oilChange?.done) {
        return { hasData: false };
      }
      const oil = lastOilService.oilChange;
      const serviceKm = Number(lastOilService.km) || 0;
      const currentKm = Number(car.currentKm) || 0;
      const nextKm = Number(oil.nextKm) || 0;
      const interval = Number(oil.mileage) || 0;

      let lifeKm = 0;
      if (nextKm > serviceKm) lifeKm = nextKm - serviceKm;
      else if (interval > 0) lifeKm = interval;
      else return { hasData: false };

      const usedKm = Math.max(0, currentKm - serviceKm);
      let usedRatio = usedKm / lifeKm; // 0 → 1+
      if (!isFinite(usedRatio) || usedRatio < 0) usedRatio = 0;

      const usedPercent = Math.round(usedRatio * 100);
      const remainingKm = Math.max(0, Math.round(lifeKm - usedKm));
      let level = "ok"; // سبز
      if (usedRatio >= 1)
        level = "critical"; // قرمز / گذشته
      else if (usedRatio >= 0.85)
        level = "warn"; // نارنجی
      else if (usedRatio >= 0.7) level = "caution"; // زرد-نارنجی

      return {
        hasData: true,
        usedPercent: Math.min(usedPercent, 999),
        displayPercent: Math.min(usedPercent, 100), // برای قوس گیج حداکثر ۱۰۰
        remainingKm,
        usedKm: Math.round(usedKm),
        lifeKm: Math.round(lifeKm),
        level,
        oilName: oil.oilName || "",
        overdue: usedRatio >= 1,
      };
    }

    const oilGauge = computeOilGauge(car, lastOil);

    const hasPhoto = !!car.photo;
    summary.classList.toggle("dash-summary--photo", hasPhoto);
    summary.classList.add("card");

    const photoUrl = hasPhoto ? car.photo.replace(/'/g, "\\'") : "";

    // قابل تنظیم: راست ۱۰۰٪ تا solid، بعد تا end به ۰٪ می‌رسد (به سمت چپ)
    const fadeSolid = "25%";
    const fadeEnd = "100%";

    summary.innerHTML = `
      ${
        hasPhoto
          ? `
        <div class="dash-summary__photo"
             style="background-image:url('${photoUrl}');--dash-fade-solid:${fadeSolid};--dash-fade-end:${fadeEnd}"></div>
        <div class="dash-summary__photo-scrim" aria-hidden="true"></div>
      `
          : ""
      }
      <div class="dash-summary__content">
        <div class="dash-summary__title-block">
          <h2 class="dash-summary__car-name">${escapeHtml(dashboardCarModel(car) || "خودرو")}</h2>
          <div class="dash-summary__update-actions">
            <button type="button" class="btn btn--secondary btn--small dash-summary__update-btn"><span class="sf">${acIcon("refresh")}</span> به‌روزرسانی کیلومتر</button>
          </div>
        </div>
        ${car.otherSpecTitle ? `<p class="dash-summary__car-subtitle">${escapeHtml(car.otherSpecTitle)}</p>` : ""}
        <div class="dash-summary__row dash-summary__row--top">
          <div>
            <p class="dash-summary__km">${formatKm(car.currentKm)}</p>
            <p class="dash-summary__updated">آخرین به‌روزرسانی: ${car.kmUpdatedAt ? toFaDigits(car.kmUpdatedAt) : "—"}</p>
          </div>
        </div>
        <div class="dash-summary__divider"></div>
        <div class="dash-summary__grid">
          <div class="dash-summary__stat">
            <p class="dash-summary__stat-label">تعداد سرویس‌ها</p>
            <p class="dash-summary__stat-value">${toFaDigits(carServices.length)}</p>
          </div>
          <div class="dash-summary__stat">
            <p class="dash-summary__stat-label">مبلغ کل سرویس‌ها</p>
            <p class="dash-summary__stat-value">${formatToman(totalCost)}</p>
          </div>
          <div class="dash-summary__stat dash-summary__stat--plate">
            <div class="dash-summary__plate-mount"></div>
          </div>
        </div>
      </div>
    `;
    const plateMount = summary.querySelector(".dash-summary__plate-mount");
    if (plateMount) {
      plateMount.innerHTML = "";
      plateMount.appendChild(createIranPlateDisplay(car.plate));
    }
    summary
      .querySelector(".dash-summary__update-btn")
      ?.addEventListener("click", () => openKmUpdateSheet(car));
  }

  const docsSection = root.querySelector("#dash-docs");
  function docStatusFromDays(days) {
    if (days === null) return { cls: "neutral", text: "ثبت نشده" };
    if (days < 0) return { cls: "danger", text: "منقضی شده" };
    if (days <= 14) return { cls: "danger", text: `${toFaDigits(days)} روز مانده` };
    if (days <= 30) return { cls: "warning", text: `${toFaDigits(days)} روز مانده` };
    return { cls: "success", text: `${toFaDigits(days)} روز مانده` };
  }

  /** یافتن اولین قسط پرداخت‌نشده‌ای که مبلغ یا تاریخ برایش ثبت شده */
  function findNextDuePayment(insurance) {
    const payments = insurance.payments || {};
    const cashPayment = payments.cash;
    if (cashPayment && (cashPayment.amount || cashPayment.date) && !cashPayment.paid) {
      return { key: "cash", label: "نقد", ...cashPayment };
    }
    for (let index = 1; index <= 12; index += 1) {
      const p = payments[`inst${index}`];
      if (!p) break;
      const hasData = p.amount || p.date || p.paid;
      if (!hasData) break;
      if (!p.paid) {
        return { key: `inst${index}`, label: `قسط ${toFaDigits(index)}`, ...p };
      }
    }
    return null;
  }

  function renderDocs() {
    const car = cars.find((c) => c.id === activeCarId);
    if (!car) return;
    const inspection = car.inspection || {};
    const insurance = car.insurance || {};
    const inspDays = daysUntilJalali(inspection.expiryDate);
    const insDays = daysUntilJalali(insurance.toDate);
    const inspStatus = docStatusFromDays(inspDays);
    const insStatus = docStatusFromDays(insDays);

    const nextDue = findNextDuePayment(insurance);
    let insMetaHTML = insurance.toDate
      ? `اعتبار تا ${toFaDigits(insurance.toDate)}`
      : "بیمه‌نامه ثبت نشده";
    let payActionHTML = "";
    if (nextDue) {
      const dueDays = nextDue.date ? daysUntilJalali(nextDue.date) : null;
      const amountText = nextDue.amount ? formatToman(nextDue.amount) : "بدون مبلغ";
      if (dueDays === null) {
        insMetaHTML += ` · ${nextDue.label} · ${amountText}`;
      } else if (dueDays < 0) {
        insMetaHTML += ` · ${nextDue.label} · ${amountText} · موعد پرداخت گذشته و ثبت نشده`;
      } else {
        insMetaHTML += ` · ${nextDue.label} · ${amountText} · ${toFaDigits(dueDays)} روز مانده`;
      }
      payActionHTML = `<button type="button" class="dash-doc-card__pay-btn" data-pay-key="${nextDue.key}" aria-label="ثبت پرداخت ${nextDue.label}"><span class="sf">${acIcon("checkmark")}</span><span class="dash-doc-card__action-label">ثبت پرداخت ${nextDue.label}</span></button>`;
    } else if (insurance.toDate) {
      insMetaHTML += " · همه اقساط پرداخت شده";
    }

    docsSection.innerHTML = `
      <div class="dash-doc-card">
        <div class="dash-doc-card__header">
          <span class="dash-doc-card__header-icon sf">${acIcon("car-front-check")}</span>
          <span>معاینه فنی</span>
        </div>
        <div class="dash-doc-card__body">
          <span class="dash-doc-card__status dash-doc-card__status--${inspStatus.cls}">${inspStatus.text}</span>
          <p class="dash-doc-card__meta">${inspection.expiryDate ? "اعتبار تا " + toFaDigits(inspection.expiryDate) : "معاینه فنی ثبت نشده"}</p>
        </div>
      </div>
      <div class="dash-doc-card">
        <div class="dash-doc-card__header">
          <span class="dash-doc-card__header-icon sf">${acIcon("quotation")}</span>
          <span class="dash-doc-card__header-title">بیمه‌نامه</span>
          <div class="dash-doc-card__actions">
            ${payActionHTML}
            <button type="button" class="dash-doc-card__status-btn" aria-label="وضعیت اقساط"><span class="sf">${acIcon("quotation")}</span><span class="dash-doc-card__action-label">وضعیت اقساط</span></button>
          </div>
        </div>
        <div class="dash-doc-card__body">
          <span class="dash-doc-card__status dash-doc-card__status--${insStatus.cls}">${insStatus.text}</span>
          <p class="dash-doc-card__meta">${insMetaHTML}</p>
        </div>
      </div>
    `;

    const payBtn = docsSection.querySelector(".dash-doc-card__pay-btn");
    if (payBtn) {
      payBtn.addEventListener("click", async () => {
        const key = payBtn.getAttribute("data-pay-key");
        if (car.insurance && car.insurance.payments && car.insurance.payments[key]) {
          const confirmed = await showAlert({
            title: "تایید پرداخت",
            message: `آیا از ثبت پرداخت ${nextDue.label} مطمئن هستید؟`,
            confirmText: "ثبت پرداخت",
            cancelText: "انصراف",
          });
          if (!confirmed) return;
          car.insurance.payments[key].paid = true;
          await CarsAPI.save(car);
          showToast("پرداخت ثبت شد", "success");
          renderDocs();
        }
      });
    }
    docsSection.querySelector(".dash-doc-card__status-btn")?.addEventListener("click", () => {
      openInsuranceReceipt(car);
    });
  }

  async function renderMaintenanceSection() {
    const car = cars.find((c) => c.id === activeCarId);
    if (!car) {
      maintSection.innerHTML = "";
      return;
    }
    const latestMap = await MaintenanceAPI.getLatestByCarId(car.id);
    const currentKm = Number(car.currentKm) || 0;

    // روغن موتور: از نگهداری، یا از آخرین سرویس روغن
    let oilRecord = latestMap["engine-oil"] || null;
    if (!oilRecord) {
      const lastOil = [...allServices]
        .filter((s) => s.carId === car.id && s.oilChange && s.oilChange.done)
        .sort(
          (a, b) =>
            (jalaliStrToDate(b.date) || 0) - (jalaliStrToDate(a.date) || 0),
        )[0];
      if (lastOil) {
        const oil = lastOil.oilChange;
        let lifeKm = Number(oil.mileage) || 0;
        const nextKm = Number(oil.nextKm) || 0;
        const serviceKm = Number(lastOil.km) || 0;
        if (!lifeKm && nextKm > serviceKm) lifeKm = nextKm - serviceKm;
        if (!lifeKm) {
          const def = DEFAULT_PARTS.find((p) => p.id === "engine-oil");
          lifeKm = def ? def.defaultLifeKm : 5000;
        }
        oilRecord = {
          partId: "engine-oil",
          title: "روغن موتور",
          replacedKm: serviceKm,
          replacedDate: lastOil.date,
          lifeKm,
        };
      }
    }

    const oilGauge = oilRecord
      ? computePartGauge(currentKm, oilRecord.replacedKm, oilRecord.lifeKm)
      : { hasData: false };

    // سایر قطعات (غیر از روغن) — حداکثر ۴ مورد، مرتب بر اساس درصد مصرف (بحرانی اول)
    const otherItems = Object.values(latestMap)
      .filter((m) => m.partId !== "engine-oil")
      .map((m) => ({
        record: m,
        gauge: computePartGauge(currentKm, m.replacedKm, m.lifeKm),
      }))
      .filter((x) => x.gauge.hasData)
      .sort((a, b) => b.gauge.usedPercent - a.gauge.usedPercent)
      .slice(0, 4);

    const oilSub = oilGauge.hasData
      ? oilRecord.replacedDate
        ? `تعویض: ${toFaDigits(oilRecord.replacedDate)} · ${formatKm(oilRecord.replacedKm)}`
        : ""
      : "";

    maintSection.innerHTML = `
      <div class="dash-maint__header">
        <h2 class="dash-maint__title">
          نگهداری خودرو
        </h2>
      </div>
      <div class="dash-maint__oil">
        ${renderLinearBarHtml("روغن موتور", oilGauge, oilSub)}
      </div>
      <button type="button" class="dash-maint__expand" id="dash-maint-expand"
        aria-expanded="${maintExpanded ? "true" : "false"}"
        aria-label="نمایش قطعات بیشتر">
        <span class="sf dash-maint__expand-icon ${maintExpanded ? "is-open" : ""}">${acIcon("chevron-down")}</span>
      </button>
      <div class="dash-maint__collapsible ${maintExpanded ? "is-open" : ""}" id="dash-maint-collapsible">
        <div class="dash-maint__collapsible-inner">
          <div class="dash-maint__others" id="dash-maint-others">
            ${
              otherItems.length
                ? otherItems
                    .map((x) =>
                      renderLinearBarHtml(
                        x.record.title || x.record.partId,
                        x.gauge,
                        x.record.replacedDate
                          ? `تعویض: ${toFaDigits(x.record.replacedDate)}`
                          : "",
                      ),
                    )
                    .join("")
                : '<p class="empty-state__inline">قطعهٔ دیگری ثبت نشده است.</p>'
            }
          </div>
          <a href="#/maintenance" class="dash-maint__link btn btn--secondary btn--block">
            مشاهده همه · نگهداری خودرو
          </a>
        </div>
      </div>
    `;

    const expandBtn = maintSection.querySelector("#dash-maint-expand");
    const collapsible = maintSection.querySelector("#dash-maint-collapsible");
    expandBtn.addEventListener("click", () => {
      maintExpanded = !maintExpanded;
      collapsible.classList.toggle("is-open", maintExpanded);
      expandBtn.setAttribute("aria-expanded", maintExpanded ? "true" : "false");
      expandBtn
        .querySelector(".dash-maint__expand-icon")
        .classList.toggle("is-open", maintExpanded);
    });
  }

  function openKmUpdateSheet(car) {
    const sheet = openSheet({ title: "به‌روزرسانی کیلومتر", size: "small" });
    const form = document.createElement("div");
    form.className = "form-stack";
    form.innerHTML = `
      <div class="field">
        <label>کیلومتر فعلی</label>
        <input type="tel" inputmode="numeric" class="text-input" id="km-update-input" value="${formatNumberFa(car.currentKm || "")}" />
      </div>
      <button type="button" class="btn btn--primary btn--block" id="km-update-confirm">ثبت</button>
    `;
    sheet.body.appendChild(form);
    let kmRaw = car.currentKm ? String(car.currentKm) : "";
    bindThousandsInput(form.querySelector("#km-update-input"), (raw) => {
      kmRaw = raw;
    });
    form
      .querySelector("#km-update-confirm")
      .addEventListener("click", async () => {
        if (!kmRaw) {
          showToast("کیلومتر را وارد کنید", "error");
          return;
        }
        car.currentKm = Number(kmRaw);
        car.kmUpdatedAt = todayJalaliStr();
        await CarsAPI.save(car);
        sheet.close();
        showToast("کیلومتر به‌روزرسانی شد", "success");
        renderSummary();
        renderDocs();
        renderMaintenanceSection();
      });
  }

  function renderQuickButtons() {
    quickButtons.innerHTML = `
      <button type="button" class="quick-action-btn" id="quick-new-service-btn">
        <span class="quick-action-btn__icon sf">${acIcon("wrench-add")}</span>
        <span>سرویس جدید</span>
      </button>
      <button type="button" class="quick-action-btn" id="quick-search-service-btn">
        <span class="quick-action-btn__icon sf">${acIcon("car-front-add")}</span>
        <span>خودرو جدید</span>
      </button>
    `;
    quickButtons
      .querySelector("#quick-new-service-btn")
      .addEventListener("click", () => navigate("#/services/new"));
    quickButtons
      .querySelector("#quick-search-service-btn")
      .addEventListener("click", () => navigate("#/services"));
  }

  function renderRecent() {
    const carServices = allServices
      .filter((s) => s.carId === activeCarId)
      .sort(
        (a, b) =>
          (jalaliStrToDate(b.date) || 0) - (jalaliStrToDate(a.date) || 0),
      )
      .slice(0, 3);
    recentList.innerHTML = "";
    if (!carServices.length) {
      recentList.innerHTML =
        '<p class="empty-state__inline">سرویسی برای این خودرو ثبت نشده است.</p>';
      return;
    }
    const car = cars.find((c) => c.id === activeCarId);
    carServices.forEach((s) => {
      const card = createServiceCard(s, car, openServiceReceipt, () =>
        navigate(`#/services/${s.id}/edit`),
      );
      recentList.appendChild(card);
    });
  }

  renderStrip();
  renderSummary();
  renderDocs();
  renderMaintenanceSection();
  renderQuickButtons();
  renderRecent();
  removeFab();
}

/* ==================================================
   صفحه خودروهای من
   ================================================== */

async function renderCarsListPage(params, root) {
  renderTabBar("#/cars");
  const cars = await CarsAPI.getAll();
  root.innerHTML = `
    <header class="page-header">
      <h1>خودروهای من</h1>
      <p class="page-header__subtitle">${toFaDigits(cars.length)} خودرو</p>
    </header>
    <div class="car-list"></div>
  `;
  const list = root.querySelector(".car-list");
  if (!cars.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon sf">${acIcon("car-front")}</span>
        <h2>خودرویی ثبت نشده</h2>
        <p>با دکمه شناور پایین صفحه، اولین خودروی خود را اضافه کنید.</p>
      </div>`;
  } else {
    cars.forEach((car) => {
      list.appendChild(
        createCarCard(car, () => navigate(`#/cars/${car.id}/edit`)),
      );
    });
  }
  renderFab("خودرو", () => navigate("#/cars/new"));
}

/* ==================================================
   صفحه افزودن/ویرایش خودرو
   ================================================== */

async function renderCarFormPage(params, root) {
  removeFab();
  const isEdit = !!params.id;
  const existing = isEdit ? await CarsAPI.getById(params.id) : null;
  if (isEdit && !existing) {
    navigate("#/cars");
    return;
  }

  const state = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: generateId(),
        plate: {},
        brand: "",
        model: "",
        brandModel: "",
        color: null,
        year: null,
        yearCalendar: "jalali",
        fuelType: "",
        otherSpecPhoto: null,
        otherSpecTitle: "",
        currentKm: "",
        dailyKm: "",
        photo: null,
        wantsPlate: true,
        inspection: null,
        insurance: createEmptyInsurance(),
      };

  if (!state.inspection || typeof state.inspection !== "object") {
    state.inspection = {
      date: "",
      expiryDate: "",
      notifyBefore: "week1",
      photos: [],
    };
  }
  if (!Array.isArray(state.inspection.photos)) state.inspection.photos = [];

  if (!state.insurance || typeof state.insurance !== "object") {
    state.insurance = createEmptyInsurance();
  }
  if (!state.insurance.payments || typeof state.insurance.payments !== "object") {
    state.insurance.payments = createEmptyInsurance().payments;
  }
  INS_PAYMENT_ROWS.forEach(({ key }) => {
    if (!state.insurance.payments[key]) state.insurance.payments[key] = { amount: "", date: "", paid: false };
  });

  if (!state.plate || typeof state.plate !== "object") {
    state.plate = {};
  }
  if (typeof state.wantsPlate !== "boolean") {
    state.wantsPlate =
      isPlateComplete(state.plate) || isPlatePartial(state.plate);
  }

  document.getElementById("tab-bar")?.remove();

  root.innerHTML = `
    <header class="page-header page-header--form">
      <a href="#/cars" class="page-header__back sf" aria-label="بازگشت">${acIcon("chevron-right")}</a>
      <h1>${isEdit ? "ویرایش خودرو" : "افزودن خودرو"}</h1>
    </header>
    <form class="form-stack car-form" novalidate>
      <div class="field">
        <label class="field__checkbox-label">
          <input type="checkbox" id="wants-plate-checkbox" ${state.wantsPlate !== false ? "checked" : ""} />
          <span>ثبت پلاک خودرو</span>
        </label>
      </div>
      <div class="field plate-field"></div>

      <div class="field">
        <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("car-front")}</span>مدل خودرو</label>
        <div class="model-combo"></div>
      </div>

      <div class="field">
        <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("palette")}</span>رنگ خودرو</label>
        <div class="color-combo"></div>
      </div>

      <div class="field">
        <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("calendar")}</span>سال ساخت</label>
        <div class="year-combo"></div>
      </div>

      <div class="field">
        <button type="button" class="text-input text-input--button other-spec-trigger">
          <span class="sf other-spec-trigger__chevron">${acIcon("chevron-down")}</span>
          <span class="other-spec-trigger__text">مشخصات دیگر (نوع سوخت، عنوان و تصویر)</span>
        </button>
        <div class="other-spec-panel" hidden>
          <div class="other-spec-panel__inner">
            <div class="field">
              <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("generic-fuel-pump")}</span>نوع سوخت</label>
              <div class="fuel-combo"></div>
            </div>
            <div class="field">
              <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("quote")}</span>عنوان دلخواه</label>
              <input type="text" class="text-input" id="other-spec-title" value="${escapeHtml(state.otherSpecTitle || "")}" placeholder="مثال: خودرو گازسوز کارخانه‌ای" />
            </div>
            <div class="field">
              <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("image")}</span>تصویر خودرو</label>
              <div class="photo-mount"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("work-mode-trip")}</span>کیلومتر فعلی</label>
          <input type="tel" inputmode="numeric" class="text-input" id="current-km-input" value="${state.currentKm ? formatNumberFa(state.currentKm) : ""}" />
        </div>
        <div class="field">
          <label class="field__label-with-icon"></span>کیلومتر تقریبی روزانه</label>
          <input type="tel" inputmode="numeric" class="text-input" id="daily-km-input" value="${state.dailyKm ? formatNumberFa(state.dailyKm) : ""}" />
          <p class="field__hint" id="monthly-km-hint"></p>
        </div>
      </div>

      <div class="field">
        <div class="other-spec-trigger-row">
          <button type="button" class="text-input text-input--button other-spec-trigger" id="inspection-trigger">
            <span class="sf other-spec-trigger__chevron">${acIcon("chevron-down")}</span>
            <span class="other-spec-trigger__text">معاینه فنی خودرو (اختیاری)</span>
          </button>
          <button type="button" class="form-reset-btn" id="inspection-reset-btn" title="بازنشانی معاینه فنی" aria-label="بازنشانی معاینه فنی">
            <span class="sf">${acIcon("trash")}</span>
          </button>
        </div>
        <div class="other-spec-panel" id="inspection-panel" hidden>
          <div class="other-spec-panel__inner">
            <div class="field-row">
              <div class="field">
                <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("calendar")}</span>تاریخ معاینه</label>
                <button type="button" class="text-input text-input--button" id="inspection-date-btn">${state.inspection.date ? toFaDigits(state.inspection.date) : "انتخاب تاریخ"}</button>
              </div>
              <div class="field">
                <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("calendar")}</span>تاریخ اعتبار</label>
                <button type="button" class="text-input text-input--button" id="inspection-expiry-btn">${state.inspection.expiryDate ? toFaDigits(state.inspection.expiryDate) : "انتخاب تاریخ"}</button>
              </div>
            </div>
            <div class="field">
              <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("bell")}</span>زمان اطلاع‌رسانی</label>
              <div class="inspection-notify-combo"></div>
            </div>
            <div class="field">
              <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("image")}</span>تصاویر کارت معاینه فنی</label>
              <div class="inspection-gallery-mount"></div>
            </div>
            <p class="field__hint">قبل از تاریخ انقضای معاینه فنی، نسبت به تمدید آن اقدام نمایید. با ثبت تاریخ معاینه، پیش از پایان اعتبار به شما اطلاع‌رسانی خواهد شد.</p>
          </div>
        </div>
      </div>

      <div class="field">
        <div class="other-spec-trigger-row">
          <button type="button" class="text-input text-input--button other-spec-trigger" id="insurance-trigger">
            <span class="sf other-spec-trigger__chevron">${acIcon("chevron-down")}</span>
            <span class="other-spec-trigger__text">بیمه‌نامه خودرو (اختیاری)</span>
          </button>
          <button type="button" class="form-reset-btn" id="insurance-reset-btn" title="بازنشانی بیمه‌نامه" aria-label="بازنشانی بیمه‌نامه">
            <span class="sf">${acIcon("trash")}</span>
          </button>
        </div>
        <div class="other-spec-panel" id="insurance-panel" hidden>
          <div class="other-spec-panel__inner">
            <section class="section-block">
              <div class="section-block__header"><h2>تعهدات بیمه‌نامه</h2></div>
              <div class="field-row">
                <div class="field">
                  <label>از ساعت ۰۰ روز</label>
                  <button type="button" class="text-input text-input--button" id="ins-from-date-btn">${state.insurance.fromDate ? toFaDigits(state.insurance.fromDate) : "انتخاب تاریخ"}</button>
                </div>
                <div class="field">
                  <label>تا ساعت ۲۴ روز</label>
                  <button type="button" class="text-input text-input--button" id="ins-to-date-btn">${state.insurance.toDate ? toFaDigits(state.insurance.toDate) : "انتخاب تاریخ"}</button>
                </div>
              </div>
            </section>

            <section class="section-block">
              <div class="section-block__header"><h2>پرداخت بیمه</h2></div>
              <div class="ins-payments-list"></div>
            </section>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn--primary btn--block car-form__submit">${isEdit ? "ذخیره تغییرات" : "ثبت خودرو"}</button>

      ${isEdit ? '<button type="button" class="btn btn--destructive btn--block car-form__delete">حذف خودرو</button>' : ""}
    </form>
  `;

  // عکس خودرو (باکس حرفه‌ای با امکان حذف/تغییر)
  root.querySelector(".photo-mount").appendChild(
    createPhotoPicker({
      value: state.photo,
      placeholderIcon: "car",
      onChange: (dataUrl) => {
        state.photo = dataUrl;
      },
    }),
  );

  // پلاک
  const plateFieldEl = root.querySelector(".plate-field");
  function renderPlateWidget() {
    const existing = plateFieldEl.querySelector(".iran-plate-widget");

    if (state.wantsPlate === false) {
      if (existing && !plateFieldEl.classList.contains("is-collapsing")) {
        plateFieldEl.classList.add("is-collapsing");
        existing.classList.add("is-leaving");
        setTimeout(() => {
          plateFieldEl.innerHTML = "";
          plateFieldEl.classList.remove("is-collapsing");
        }, 300);
      } else if (!existing) {
        plateFieldEl.innerHTML = "";
        plateFieldEl.classList.remove("is-collapsing");
      }
      return;
    }

    plateFieldEl.classList.remove("is-collapsing");
    plateFieldEl.innerHTML = "";
    // مهم: هرگز null نده
    const widget = createIranPlateWidget(state.plate || {}, (val) => {
      state.plate = val;
    });
    plateFieldEl.appendChild(widget);
  }
  renderPlateWidget();
  root
    .querySelector("#wants-plate-checkbox")
    .addEventListener("change", (e) => {
      state.wantsPlate = e.target.checked;
      renderPlateWidget();
    });

      // مدل - شیت چندسطحی: برند → سری (اختیاری) → مدل نهایی
  const modelComboWrap = root.querySelector(".model-combo");

  function applyBrandModel(brand, model) {
    state.brand = brand || "";
    state.model = model || "";
    state.brandModel = model ? `${brand} - ${model}` : brand || "";
    renderModelCombo();
  }

  function openBrandModelSheet() {
    const sheet = openSheet({ title: "انتخاب برند / مدل", size: "default" });
    const searchWrap = document.createElement("div");
    searchWrap.className = "combobox__search-wrap";
    searchWrap.innerHTML = `<input type="text" class="text-input" placeholder="جستجوی برند یا مدل…" inputmode="search" />`;
    const list = document.createElement("div");
    list.className = "combobox__list";
    sheet.body.appendChild(searchWrap);
    sheet.body.appendChild(list);

    let level = "brands"; // brands | series | models
    let activeBrand = null;
    let activeSeries = null;

    function pickModel(brand, model) {
      applyBrandModel(brand, model);
      sheet.close();
    }

    function renderList(filter = "") {
      list.innerHTML = "";
      const f = filter.trim();

      // جستجوی سراسری
      if (f) {
        Object.keys(CAR_CATALOG).forEach((brand) => {
          if (brand.includes(f)) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "combobox__row";
            row.innerHTML = `<span>${escapeHtml(brand)}</span><span class="combobox__row-meta">برند</span>`;
            row.addEventListener("click", () => {
              activeBrand = brand;
              activeSeries = null;
              level = isCatalogGroup(CAR_CATALOG[brand]) ? "series" : "models";
              searchWrap.querySelector("input").value = "";
              renderList("");
            });
            list.appendChild(row);
          }
          flattenBrandModels(brand).forEach(({ model }) => {
            if (!String(model).includes(f) && !`${brand} ${model}`.includes(f))
              return;
            const row = document.createElement("button");
            row.type = "button";
            row.className =
              "combobox__row" +
              (state.brand === brand && state.model === model
                ? " is-selected"
                : "");
            row.innerHTML = `<span>${escapeHtml(brand)} - ${escapeHtml(model)}</span>`;
            row.addEventListener("click", () => pickModel(brand, model));
            list.appendChild(row);
          });
        });
        if (!list.children.length) {
          list.innerHTML = '<p class="combobox__empty">موردی یافت نشد</p>';
        }
        return;
      }

      // بازگشت
      if (level !== "brands") {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "combobox__row combobox__row--back";
        back.innerHTML = "<span>→ بازگشت</span>";
        back.addEventListener("click", () => {
          if (level === "models" && isCatalogGroup(CAR_CATALOG[activeBrand])) {
            level = "series";
            activeSeries = null;
          } else {
            level = "brands";
            activeBrand = null;
            activeSeries = null;
          }
          renderList("");
        });
        list.appendChild(back);
      }

      // برندها
      if (level === "brands") {
        Object.keys(CAR_CATALOG).forEach((brand) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "combobox__row" + (state.brand === brand ? " is-selected" : "");
          row.innerHTML = `<span>${escapeHtml(brand)}</span>`;
          row.addEventListener("click", () => {
            activeBrand = brand;
            activeSeries = null;
            level = isCatalogGroup(CAR_CATALOG[brand]) ? "series" : "models";
            renderList("");
          });
          list.appendChild(row);
        });
        return;
      }

      // سری (انتخاب نهایی نیست)
      if (level === "series") {
        const group = CAR_CATALOG[activeBrand] || {};
        Object.keys(group).forEach((series) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "combobox__row";
          const val = group[series];
          const isLeaf =
            typeof val === "string" ||
            (Array.isArray(val) && val.length <= 1);
          row.innerHTML = isLeaf
            ? `<span>${escapeHtml(typeof val === "string" ? val : val[0] || series)}</span>`
            : `<span>${escapeHtml(series)}</span><span class="combobox__row-meta">←</span>`;
          row.addEventListener("click", () => {
            if (typeof val === "string") {
              pickModel(activeBrand, val);
              return;
            }
            if (Array.isArray(val) && val.length === 1) {
              pickModel(activeBrand, val[0]);
              return;
            }
            // چند تریم → مرحله سوم
            activeSeries = series;
            level = "models";
            renderList("");
          });
          list.appendChild(row);
        });
        return;
      }

      // مدل نهایی
      if (level === "models") {
        const entry = CAR_CATALOG[activeBrand];
        let models = [];
        if (Array.isArray(entry)) {
          models = entry;
        } else if (isCatalogGroup(entry) && activeSeries) {
          models = Array.isArray(entry[activeSeries])
            ? entry[activeSeries]
            : [];
        }
        models.forEach((model) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "combobox__row" +
            (state.brand === activeBrand && state.model === model
              ? " is-selected"
              : "");
          row.innerHTML = `<span>${escapeHtml(model)}</span>`;
          row.addEventListener("click", () => pickModel(activeBrand, model));
          list.appendChild(row);
        });
        if (!models.length) {
          const empty = document.createElement("p");
          empty.className = "combobox__empty";
          empty.textContent = "مدلی تعریف نشده";
          list.appendChild(empty);
        }
      }
    }

    renderList();
    searchWrap.querySelector("input").addEventListener("input", (e) => {
      renderList(e.target.value);
    });
  }

  function renderModelCombo() {
    modelComboWrap.innerHTML = "";
    const display = state.model
      ? state.brandModel || `${state.brand} - ${state.model}`
      : state.brand || "";

    const wrap = document.createElement("div");
    wrap.className = "combobox";
    wrap.innerHTML = `
      <button type="button" class="combobox__trigger">
        <span class="combobox__value">${
          display
            ? escapeHtml(display)
            : `<span class="combobox__placeholder">انتخاب برند / مدل</span>`
        }</span>
        <span class="combobox__chevron sf">${acIcon("chevron-down")}</span>
      </button>`;
    wrap
      .querySelector(".combobox__trigger")
      .addEventListener("click", openBrandModelSheet);
    modelComboWrap.appendChild(wrap);
  }

  // نرمال‌سازی رکوردهای قدیمی (ویرایش)
  if (state.brandModel && (!state.brand || !state.model)) {
    const parts = String(state.brandModel).split(" - ");
    if (!state.brand && parts[0]) state.brand = parts[0].trim();
    if (!state.model && parts.length > 1) {
      state.model = parts.slice(1).join(" - ").trim();
    }
  }

  renderModelCombo();

  // رنگ
  const colorComboWrap = root.querySelector(".color-combo");
  const colorItems = CAR_COLORS.map((c) => ({
    value: c.name,
    label: c.name,
    hex: c.hex,
  }));
  colorComboWrap.appendChild(
    createCombobox({
      items: colorItems,
      value: state.color ? state.color.name : null,
      placeholder: "انتخاب رنگ",
      searchable: false,
      renderItem: (item) =>
        `<span class="color-dot" style="background:${item.hex}"></span><span>${escapeHtml(item.label)}</span>`,
      onSelect: (item) => {
        state.color = { name: item.value, hex: item.hex };
      },
    }),
  );

  // سال ساخت (تقویم شمسی/میلادی به داخل همان Combo Box منتقل شد)
  const yearComboWrap = root.querySelector(".year-combo");
  function currentJalaliYear() {
    return Number(todayJalaliStr().split("/")[0]);
  }
  function yearsFor(calendar) {
    const isJalali = calendar !== "gregorian";
    const maxYear = isJalali ? currentJalaliYear() : new Date().getFullYear();
    const minYear = isJalali ? 1345 : 1946;
    const years = [];
    for (let y = maxYear; y >= minYear; y -= 1) years.push(y);
    return years;
  }
  function renderYearCombo() {
    yearComboWrap.innerHTML = "";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "text-input text-input--button year-combo__trigger";
    trigger.innerHTML = `<span>${state.year ? toFaDigits(state.year) : '<span class="combobox__placeholder">انتخاب سال ساخت</span>'}</span><span class="sf year-combo__chevron">${acIcon("chevron-down")}</span>`;
    trigger.addEventListener("click", () => {
      const sheet = openSheet({ title: "سال ساخت", size: "default" });
      const box = document.createElement("div");
      box.className = "year-combo-sheet";
      const toggleMount = document.createElement("div");
      toggleMount.className = "year-combo-sheet__toggle";
      box.appendChild(toggleMount);
      const listMount = document.createElement("div");
      listMount.className = "combobox__list";
      box.appendChild(listMount);
      sheet.body.appendChild(box);

      function renderYearList() {
        listMount.innerHTML = "";
        yearsFor(state.yearCalendar).forEach((y) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "combobox__row" + (state.year === y ? " is-selected" : "");
          row.innerHTML = `<span>${toFaDigits(y)}</span>`;
          row.addEventListener("click", () => {
            state.year = y;
            renderYearCombo();
            sheet.close();
          });
          listMount.appendChild(row);
        });
      }
      toggleMount.appendChild(
        createSegmentedControl(
          ["شمسی", "میلادی"],
          state.yearCalendar === "gregorian" ? "میلادی" : "شمسی",
          (val) => {
            state.yearCalendar = val === "میلادی" ? "gregorian" : "jalali";
            state.year = null;
            renderYearList();
          },
        ),
      );
      renderYearList();
    });
    yearComboWrap.appendChild(trigger);
  }
  renderYearCombo();

  // مشخصات دیگر (نمایش درون‌خطی به‌جای پاپ‌آپ)
  const otherSpecTrigger = root.querySelector(".other-spec-trigger");
  const otherSpecPanel = root.querySelector(".other-spec-panel");
  let otherSpecOpen = !!(state.fuelType || state.otherSpecTitle || state.photo);

  function renderOtherSpecToggleState() {
    otherSpecTrigger.classList.toggle("is-open", otherSpecOpen);
    otherSpecPanel.classList.toggle("is-open", otherSpecOpen);
    if (otherSpecOpen) {
      otherSpecPanel.hidden = false;
    } else {
      const onEnd = (e) => {
        if (
          e.propertyName !== "grid-template-rows" &&
          e.propertyName !== "opacity"
        )
          return;
        if (!otherSpecOpen) otherSpecPanel.hidden = true;
        otherSpecPanel.removeEventListener("transitionend", onEnd);
      };
      otherSpecPanel.addEventListener("transitionend", onEnd);
      setTimeout(() => {
        if (!otherSpecOpen) otherSpecPanel.hidden = true;
      }, 320);
    }
  }

  otherSpecTrigger.addEventListener("click", () => {
    otherSpecOpen = !otherSpecOpen;
    if (otherSpecOpen) otherSpecPanel.hidden = false;
    if (otherSpecOpen) void otherSpecPanel.offsetHeight;
    renderOtherSpecToggleState();
  });

  if (otherSpecOpen) {
    otherSpecPanel.hidden = false;
    otherSpecPanel.classList.add("is-open");
    otherSpecTrigger.classList.add("is-open");
  } else {
    otherSpecPanel.hidden = true;
    otherSpecPanel.classList.remove("is-open");
  }

  root.querySelector(".fuel-combo").appendChild(
    createCombobox({
      items: FUEL_TYPES.map((f) => ({ value: f, label: f })),
      value: state.fuelType || null,
      placeholder: "انتخاب نوع سوخت",
      searchable: false,
      onSelect: (item) => {
        state.fuelType = item.value;
      },
    }),
  );
  root.querySelector("#other-spec-title").addEventListener("input", (e) => {
    state.otherSpecTitle = e.target.value;
  });
  // کیلومتر فعلی و روزانه (فرمت زنده با جداکننده هزارگان)
  const currentKmInput = root.querySelector("#current-km-input");
  const dailyInput = root.querySelector("#daily-km-input");
  const monthlyHint = root.querySelector("#monthly-km-hint");
  let currentKmRaw = state.currentKm ? String(state.currentKm) : "";
  let dailyKmRaw = state.dailyKm ? String(state.dailyKm) : "";
  function updateMonthlyHint() {
    const monthly = calcMonthlyFromDaily(dailyKmRaw);
    monthlyHint.textContent = monthly ? `${formatKm(monthly)} در ماه` : "";
  }
  bindThousandsInput(currentKmInput, (raw) => {
    currentKmRaw = raw;
  });
  bindThousandsInput(dailyInput, (raw) => {
    dailyKmRaw = raw;
    updateMonthlyHint();
  });
  updateMonthlyHint();

  /* ---------- معاینه فنی خودرو ---------- */
  const inspectionTrigger = root.querySelector("#inspection-trigger");
  const inspectionPanel = root.querySelector("#inspection-panel");
  let inspectionOpen = !!(
    state.inspection.date ||
    state.inspection.photos.length
  );
  let expiryManuallyEdited = !!state.inspection.expiryDate && !!state.inspection.date;

  function toggleCollapsible(trigger, panel, open) {
    trigger.classList.toggle("is-open", open);
    panel.classList.toggle("is-open", open);
    if (open) {
      panel.hidden = false;
    } else {
      const onEnd = (e) => {
        if (e.propertyName !== "grid-template-rows" && e.propertyName !== "opacity") return;
        if (!panel.classList.contains("is-open")) panel.hidden = true;
        panel.removeEventListener("transitionend", onEnd);
      };
      panel.addEventListener("transitionend", onEnd);
      setTimeout(() => {
        if (!panel.classList.contains("is-open")) panel.hidden = true;
      }, 320);
    }
  }

  inspectionTrigger.addEventListener("click", () => {
    inspectionOpen = !inspectionOpen;
    if (inspectionOpen) {
      inspectionPanel.hidden = false;
      void inspectionPanel.offsetHeight;
    }
    toggleCollapsible(inspectionTrigger, inspectionPanel, inspectionOpen);
  });
  root.querySelector("#inspection-reset-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    state.inspection = { date: "", expiryDate: "", notifyBefore: "week1", photos: [] };
    inspectionDateBtn.textContent = "انتخاب تاریخ";
    inspectionExpiryBtn.textContent = "انتخاب تاریخ";
    expiryManuallyEdited = false;
    const galleryMount = root.querySelector(".inspection-gallery-mount");
    galleryMount.innerHTML = "";
    galleryMount.appendChild(createPhotoGallery({
      value: state.inspection.photos,
      max: 3,
      onChange: (photos) => {
        state.inspection.photos = photos;
      },
    }));
    const notifyMount = root.querySelector(".inspection-notify-combo");
    notifyMount.innerHTML = "";
    notifyMount.appendChild(
      createCombobox({
        items: INSPECTION_NOTIFY_OPTIONS,
        value: "week1",
        placeholder: "زمان اطلاع‌رسانی",
        searchable: false,
        onSelect: (item) => {
          state.inspection.notifyBefore = item.value;
        },
      }),
    );
    inspectionTrigger.classList.remove("is-open");
    inspectionPanel.hidden = true;
  });
  if (inspectionOpen) {
    inspectionPanel.hidden = false;
    inspectionPanel.classList.add("is-open");
    inspectionTrigger.classList.add("is-open");
  }

  const inspectionDateBtn = root.querySelector("#inspection-date-btn");
  const inspectionExpiryBtn = root.querySelector("#inspection-expiry-btn");
  inspectionDateBtn.addEventListener("click", () => {
    openJalaliDatePicker({
      value: state.inspection.date,
      onSelect: (d) => {
        state.inspection.date = d;
        inspectionDateBtn.textContent = toFaDigits(d);
        if (!expiryManuallyEdited) {
          state.inspection.expiryDate = addOneJalaliYear(d);
          inspectionExpiryBtn.textContent = toFaDigits(state.inspection.expiryDate);
        }
      },
    });
  });
  inspectionExpiryBtn.addEventListener("click", () => {
    openJalaliDatePicker({
      value: state.inspection.expiryDate || state.inspection.date,
      onSelect: (d) => {
        state.inspection.expiryDate = d;
        expiryManuallyEdited = true;
        inspectionExpiryBtn.textContent = toFaDigits(d);
      },
    });
  });

  root.querySelector(".inspection-notify-combo").appendChild(
    createCombobox({
      items: INSPECTION_NOTIFY_OPTIONS,
      value: state.inspection.notifyBefore || "week1",
      placeholder: "زمان اطلاع‌رسانی",
      searchable: false,
      onSelect: (item) => {
        state.inspection.notifyBefore = item.value;
      },
    }),
  );

  root.querySelector(".inspection-gallery-mount").appendChild(
    createPhotoGallery({
      value: state.inspection.photos,
      max: 3,
      onChange: (photos) => {
        state.inspection.photos = photos;
      },
    }),
  );

  /* ---------- بیمه‌نامه خودرو ---------- */
  const insuranceTrigger = root.querySelector("#insurance-trigger");
  const insurancePanel = root.querySelector("#insurance-panel");
  let insuranceOpen = !!state.insurance.fromDate;

  insuranceTrigger.addEventListener("click", () => {
    insuranceOpen = !insuranceOpen;
    if (insuranceOpen) {
      insurancePanel.hidden = false;
      void insurancePanel.offsetHeight;
    }
    toggleCollapsible(insuranceTrigger, insurancePanel, insuranceOpen);
  });
  root.querySelector("#insurance-reset-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    state.insurance = createEmptyInsurance();
    insFromBtn.textContent = "انتخاب تاریخ";
    insToBtn.textContent = "انتخاب تاریخ";
    insuranceToManuallyEdited = false;
    activeInstallmentCount = 0;
    renderPaymentsList();
  });
  if (insuranceOpen) {
    insurancePanel.hidden = false;
    insurancePanel.classList.add("is-open");
    insuranceTrigger.classList.add("is-open");
  }

  const insFromBtn = root.querySelector("#ins-from-date-btn");
  const insToBtn = root.querySelector("#ins-to-date-btn");
  let insuranceToManuallyEdited = !!state.insurance.toDate && !!state.insurance.fromDate;
  insFromBtn.addEventListener("click", () => {
    openJalaliDatePicker({
      value: state.insurance.fromDate,
      onSelect: (d) => {
        state.insurance.fromDate = d;
        insFromBtn.textContent = toFaDigits(d);
        if (!insuranceToManuallyEdited) {
          state.insurance.toDate = addOneJalaliYearMinusOneDay(d);
          insToBtn.textContent = toFaDigits(state.insurance.toDate);
        }
        renderPaymentsList();
      },
    });
  });
  insToBtn.addEventListener("click", () => {
    openJalaliDatePicker({
      value: state.insurance.toDate || state.insurance.fromDate,
      onSelect: (d) => {
        state.insurance.toDate = d;
        insuranceToManuallyEdited = true;
        insToBtn.textContent = toFaDigits(d);
      },
    });
  });

  const insPaymentsListEl = root.querySelector(".ins-payments-list");
  // تعداد اقساط فعال به‌صورت صریح نگه‌داری می‌شود (نه استنتاج از داده) تا رفتار
  // نمایش/افزودن/حذف قسط کاملا قابل پیش‌بینی باشد و با رندرهای دیگر (مثل انتخاب تاریخ) تغییر نکند.
  let activeInstallmentCount = 0;
  for (let i = 1; i <= 12; i += 1) {
    const p = state.insurance.payments[`inst${i}`];
    if (p && (p.amount || p.date || p.paid)) activeInstallmentCount = i;
    else break;
  }

  function renderPaymentsList() {
    insPaymentsListEl.innerHTML = "";
    const paymentRows = INS_PAYMENT_ROWS.filter(({ key }) => {
      if (key === "cash") return true;
      const n = Number(key.replace("inst", ""));
      return n <= activeInstallmentCount;
    });
    paymentRows.forEach(({ key, label }) => {
      const p = state.insurance.payments[key];
      const card = document.createElement("div");
      card.className = "mini-card ins-payment-row";
      const canRemove = key !== "cash";
      if (canRemove) card.classList.add("ins-payment-row--removable");
      card.innerHTML = `
        ${canRemove ? `<button type="button" class="ins-payment-remove" aria-label="حذف ${label}" title="حذف ${label}"><span class="sf">${acIcon("close")}</span></button>` : ""}
        <div class="ins-payment-row__header">
          <strong>${label}</strong>
          <div class="ins-payment-status-mount"></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>مبلغ (تومان)</label>
            <input type="tel" inputmode="numeric" class="text-input ins-payment-amount" value="${p.amount ? formatNumberFa(p.amount) : ""}" />
          </div>
          <div class="field">
            <label>تاریخ</label>
            <button type="button" class="text-input text-input--button ins-payment-date-btn">${p.date ? toFaDigits(p.date) : "انتخاب تاریخ"}</button>
          </div>
        </div>
      `;
      bindThousandsInput(card.querySelector(".ins-payment-amount"), (raw) => {
        p.amount = raw;
      });
      const dateBtn = card.querySelector(".ins-payment-date-btn");
      dateBtn.addEventListener("click", () => {
        openJalaliDatePicker({
          value: p.date || state.insurance.fromDate,
          onSelect: (d) => {
            p.date = d;
            dateBtn.textContent = toFaDigits(d);
          },
        });
      });
      const statusMount = card.querySelector(".ins-payment-status-mount");
      const statusButton = document.createElement("button");
      statusButton.type = "button";
      statusButton.className = "ins-payment-status";
      statusButton.addEventListener("click", () => {
        p.paid = !p.paid;
        updatePaymentStatus();
      });
      statusMount.appendChild(statusButton);

      function updatePaymentStatus() {
        statusButton.classList.toggle("is-paid", p.paid === true);
        statusButton.setAttribute("aria-pressed", String(p.paid === true));
        statusButton.innerHTML = p.paid === true
          ? `پرداخت شده`
          : "پرداخت نشده";
      }
      updatePaymentStatus();
      card.querySelector(".ins-payment-remove")?.addEventListener("click", () => {
        const removedIndex = Number(key.replace("inst", ""));
        for (let index = removedIndex; index < 12; index += 1) {
          const current = state.insurance.payments[`inst${index + 1}`];
          state.insurance.payments[`inst${index}`] = current
            ? { ...current }
            : { amount: "", date: "", paid: false };
        }
        state.insurance.payments.inst12 = { amount: "", date: "", paid: false };
        activeInstallmentCount = Math.max(0, activeInstallmentCount - 1);
        renderPaymentsList();
      });
      insPaymentsListEl.appendChild(card);
    });
    if (activeInstallmentCount < 12) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "btn btn--secondary ins-payment-add-btn";
      addButton.innerHTML = `<span class="sf">${acIcon("plus")}</span>افزودن قسط`;
      addButton.addEventListener("click", () => {
        activeInstallmentCount = Math.min(12, activeInstallmentCount + 1);
        renderPaymentsList();
      });
      insPaymentsListEl.appendChild(addButton);
    }
  }
  renderPaymentsList();

  // ثبت فرم
  root.querySelector(".car-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.brand || !state.model) {
      showToast("لطفا برند و مدل خودرو را انتخاب کنید", "error");
      return;
    }
    if (!state.color) {
      showToast("لطفا رنگ خودرو را انتخاب کنید", "error");
      return;
    }
    if (!state.year) {
      showToast("لطفا سال ساخت را انتخاب کنید", "error");
      return;
    }
    if (!currentKmRaw || Number(currentKmRaw) <= 0) {
      showToast("لطفا کیلومتر فعلی را وارد کنید", "error");
      return;
    }
    if (state.wantsPlate !== false && isPlatePartial(state.plate)) {
      showToast(
        "پلاک به‌صورت ناقص وارد شده؛ لطفا کامل کنید یا خالی بگذارید",
        "error",
      );
      return;
    }
    if (state.wantsPlate === false || !isPlateComplete(state.plate)) {
      state.plate = null;
      // اگر پلاک کامل نیست، فلگ را هم false کن تا در ویرایش بعدی گیج نشود
      if (!isPlateComplete(state.plate)) {
        state.wantsPlate =
          state.wantsPlate === false ? false : state.wantsPlate;
      }
    }
    // ساده‌تر و واضح‌تر:
    if (state.wantsPlate === false) {
      state.plate = null;
    } else if (!isPlateComplete(state.plate)) {
      // تیک خورده ولی پلاک کامل نیست — یا خطا بده (بالا) یا null
      state.plate = null;
    }
    if (!otherSpecOpen) {
      state.fuelType = "";
      state.otherSpecTitle = "";
      state.otherSpecPhoto = null;
    }
    state.currentKm = currentKmRaw || 0;
    state.dailyKm = dailyKmRaw || "";
    if (!state.kmUpdatedAt) state.kmUpdatedAt = todayJalaliStr();
    state.updatedAt = new Date().toISOString();
    if (!state.createdAt) state.createdAt = new Date().toISOString();
    await CarsAPI.save(state);
    showToast(isEdit ? "تغییرات ذخیره شد" : "خودرو ثبت شد", "success");
    navigate("#/cars");
  });

  // حذف
  if (isEdit) {
    root
      .querySelector(".car-form__delete")
      .addEventListener("click", async () => {
        const ok = await showAlert({
          title: "حذف خودرو",
          message:
            "این خودرو و تمام سرویس‌های مرتبط با آن حذف خواهند شد. آیا مطمئن هستید؟",
          confirmText: "حذف",
          destructive: true,
        });
        if (!ok) return;
        await CarsAPI.delete(state.id);
        showToast("خودرو حذف شد", "success");
        navigate("#/cars");
      });
  }

  return () => {
    renderTabBar("#/cars");
  };
}

/* ==================================================
   صفحه سرویس‌ها
   ================================================== */

const SORT_OPTIONS = ["جدیدترین", "قدیمی‌ترین", "بیشترین مبلغ", "تاریخ سرویس"];
const DATE_RANGE_OPTIONS = [
  "یک هفته گذشته",
  "یک ماه گذشته",
  "۳ ماه گذشته",
  "۶ ماه گذشته",
  "یک سال گذشته",
  "انتخاب تاریخ",
];

async function renderServicesListPage(params, root) {
  renderTabBar("#/services");
  const [services, cars] = await Promise.all([
    ServicesAPI.getAll(),
    CarsAPI.getAll(),
  ]);
  const carsById = Object.fromEntries(cars.map((c) => [c.id, c]));

  const filterState = { carId: "", title: "", dateRange: "", customDate: "", oilOnly: false };
  let sortBy = "جدیدترین";
  let viewMode = "card"; // card | timeline | compact

  root.innerHTML = `
    <header class="page-header">
      <h1>سرویس‌ها</h1>
      <p class="page-header__subtitle">${toFaDigits(services.length)} سرویس</p>
    </header>
    <div class="search-row">
      <span class="search-row__icon sf">${acIcon("search")}</span>
      <input type="text" class="search-row__input" id="service-search-input" placeholder="جستجو در عنوان سرویس…" value="${escapeHtml(filterState.title)}" />
      <button type="button" class="search-row__filter-btn sf" id="open-search-btn" aria-label="تنظیمات جستجو">${acIcon("filter-settings")}</button>
    </div>
    <div class="list-controls-row">
      <div class="sort-combo"></div>
      <div class="view-combo"></div>
    </div>
    <div class="active-filters"></div>
    <div class="service-list"></div>
  `;

  root.querySelector("#service-search-input").addEventListener("input", (e) => {
    filterState.title = e.target.value;
    renderActiveFilters();
    renderList();
  });

  const sortCombo = root.querySelector(".sort-combo");
  const viewCombo = root.querySelector(".view-combo");
  const list = root.querySelector(".service-list");
  const activeFiltersEl = root.querySelector(".active-filters");

  const VIEW_MODE_OPTIONS = [
    { value: "card", label: "نمای کارت" },
    { value: "timeline", label: "نمای تایم‌لاین" },
    { value: "compact", label: "نمای فشرده" },
  ];

  sortCombo.appendChild(
    createCombobox({
      items: SORT_OPTIONS.map((s) => ({ value: s, label: s })),
      value: sortBy,
      placeholder: "مرتب‌سازی",
      searchable: false,
      onSelect: (item) => {
        sortBy = item.value;
        renderList();
      },
    }),
  );

  viewCombo.appendChild(
    createCombobox({
      items: VIEW_MODE_OPTIONS,
      value: viewMode,
      placeholder: "نمای نمایش",
      searchable: false,
      onSelect: (item) => {
        viewMode = item.value;
        list.classList.toggle("service-list--timeline", item.value === "timeline");
        renderList();
      },
    }),
  );

  function applyFilters(items) {
    return items.filter((s) => {
      if (filterState.carId && s.carId !== filterState.carId) return false;
      if (filterState.oilOnly && !(s.oilChange && s.oilChange.done)) return false;
      if (filterState.title && !(s.title || "").includes(filterState.title))
        return false;
      if (filterState.dateRange) {
        const d = jalaliStrToDate(s.date);
        if (!d) return false;
        const now = new Date();
        let from = null;
        if (filterState.dateRange === "یک هفته گذشته")
          from = new Date(now.getTime() - 7 * 86400000);
        else if (filterState.dateRange === "یک ماه گذشته")
          from = new Date(now.getTime() - 30 * 86400000);
        else if (filterState.dateRange === "۳ ماه گذشته")
          from = new Date(now.getTime() - 90 * 86400000);
        else if (filterState.dateRange === "۶ ماه گذشته")
          from = new Date(now.getTime() - 180 * 86400000);
        else if (filterState.dateRange === "یک سال گذشته")
          from = new Date(now.getTime() - 365 * 86400000);
        else if (
          filterState.dateRange === "انتخاب تاریخ" &&
          filterState.customDate
        ) {
          const cd = jalaliStrToDate(filterState.customDate);
          if (!cd || d.toDateString() !== cd.toDateString()) return false;
        }
        if (from && d < from) return false;
      }
      return true;
    });
  }

  function applySort(items) {
    const arr = [...items];
    if (sortBy === "جدیدترین" || sortBy === "تاریخ سرویس") {
      arr.sort(
        (a, b) =>
          (jalaliStrToDate(b.date) || 0) - (jalaliStrToDate(a.date) || 0),
      );
    } else if (sortBy === "قدیمی‌ترین") {
      arr.sort(
        (a, b) =>
          (jalaliStrToDate(a.date) || 0) - (jalaliStrToDate(b.date) || 0),
      );
    } else if (sortBy === "بیشترین مبلغ") {
      arr.sort(
        (a, b) => (Number(b.totalCost) || 0) - (Number(a.totalCost) || 0),
      );
    }
    return arr;
  }

  function renderActiveFilters() {
    const chips = [];
    if (filterState.carId && carsById[filterState.carId])
      chips.push(["خودرو: " + carsById[filterState.carId].brandModel, "carId"]);
    if (filterState.title) chips.push(["عنوان: " + filterState.title, "title"]);
    if (filterState.dateRange)
      chips.push(["تاریخ: " + filterState.dateRange, "dateRange"]);
    if (filterState.oilOnly) chips.push(["فقط تعویض روغن", "oilOnly"]);
    activeFiltersEl.innerHTML = "";
    chips.forEach(([label, key]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pill pill--removable";
      chip.innerHTML = `${escapeHtml(label)} <span class="sf">${acIcon("close")}</span>`;
      chip.addEventListener("click", () => {
        filterState[key] = key === "oilOnly" ? false : "";
        if (key === "dateRange") filterState.customDate = "";
        renderActiveFilters();
        renderList();
      });
      activeFiltersEl.appendChild(chip);
    });
  }

  function renderList() {
    const filtered = applySort(applyFilters(services));
    list.innerHTML = "";
    if (!filtered.length) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon sf">${acIcon("wrench")}</span>
          <h2>سرویسی یافت نشد</h2>
          <p>با تغییر فیلترها یا ثبت سرویس جدید ادامه دهید.</p>
        </div>`;
      return;
    }
    filtered.forEach((s) => {
      const car = carsById[s.carId];
      const onClick = () => navigate(`#/services/${s.id}/edit`);
      if (viewMode === "timeline") {
        list.appendChild(createServiceTimelineItem(s, car, onClick));
      } else if (viewMode === "compact") {
        list.appendChild(createServiceCompactRow(s, car, onClick));
      } else {
        list.appendChild(createServiceCard(s, car, openServiceReceipt, onClick));
      }
    });
  }

  root.querySelector("#open-search-btn").addEventListener("click", () => {
    const sheet = openSheet({ title: "جستجوی پیشرفته", size: "default" });
    const form = document.createElement("div");
    form.className = "form-stack";
    form.innerHTML = `
      <div class="field"><label>خودرو</label><div class="adv-car-combo"></div></div>
      <div class="field"><label>بازه تاریخ سرویس</label><div class="adv-date-combo"></div></div>
      <div class="field adv-custom-date-field" style="display:none"><label>تاریخ مشخص</label><button type="button" class="text-input text-input--button adv-custom-date-btn">انتخاب تاریخ</button></div>
      <div class="field"><label>فقط سرویس‌های دارای تعویض روغن</label><div class="adv-oil-toggle"></div></div>
      <button type="button" class="btn btn--primary btn--block" id="adv-apply-btn">اعمال فیلتر</button>
    `;
    sheet.body.appendChild(form);
    form.querySelector(".adv-car-combo").appendChild(
      createCombobox({
        items: [
          { value: "", label: "همه خودروها" },
          ...cars.map((c) => ({ value: c.id, label: c.brandModel })),
        ],
        value: filterState.carId,
        placeholder: "انتخاب خودرو",
        onSelect: (item) => {
          filterState.carId = item.value;
        },
      }),
    );
    const dateField = form.querySelector(".adv-custom-date-field");
    const dateBtn = dateField.querySelector(".adv-custom-date-btn");
    if (filterState.customDate)
      dateBtn.textContent = toFaDigits(filterState.customDate);
    form.querySelector(".adv-date-combo").appendChild(
      createCombobox({
        items: [
          { value: "", label: "بدون محدودیت" },
          ...DATE_RANGE_OPTIONS.map((o) => ({ value: o, label: o })),
        ],
        value: filterState.dateRange,
        placeholder: "انتخاب بازه",
        onSelect: (item) => {
          filterState.dateRange = item.value;
          dateField.style.display = item.value === "انتخاب تاریخ" ? "" : "none";
        },
      }),
    );
    if (filterState.dateRange === "انتخاب تاریخ") dateField.style.display = "";
    dateBtn.addEventListener("click", () => {
      openJalaliDatePicker({
        value: filterState.customDate,
        onSelect: (d) => {
          filterState.customDate = d;
          dateBtn.textContent = toFaDigits(d);
        },
      });
    });
    form.querySelector(".adv-oil-toggle").appendChild(
      createSegmentedControl(
        [
          { label: "همه", value: false },
          { label: "فقط تعویض روغن", value: true },
        ],
        filterState.oilOnly,
        (val) => {
          filterState.oilOnly = val;
        },
      ),
    );
    form.querySelector("#adv-apply-btn").addEventListener("click", () => {
      sheet.close();
      renderActiveFilters();
      renderList();
    });
  });

  renderList();
  renderFab("سرویس", () => navigate("#/services/new"));
}

/* ==================================================
   صفحه ثبت/ویرایش سرویس
   ================================================== */

function computeTotalCost(state) {
  let total = 0;
  if (state.oilChange && state.oilChange.done)
    total += Number(state.oilChange.cost) || 0;
  (state.serviceItems || []).forEach((i) => {
    total += Number(i.cost) || 0;
  });
  (state.goods || []).forEach((g) => {
    total += Number(g.amount) || 0;
  });
  total += Number(state.generalCost) || 0;
  return total;
}

async function renderServiceFormPage(params, root) {
  removeFab();
  document.getElementById("tab-bar")?.remove();
  const isEdit = !!params.id;
  const [cars, catalog] = await Promise.all([
    CarsAPI.getAll(),
    CatalogAPI.getAll(),
  ]);

  if (!cars.length) {
    root.innerHTML = `
      <header class="page-header page-header--form">
        <a href="#/services" class="page-header__back sf">${acIcon("chevron-right")}</a>
        <h1>ثبت سرویس</h1>
      </header>
      <div class="empty-state">
        <span class="empty-state__icon sf">${acIcon("car-front")}</span>
        <h2>ابتدا یک خودرو ثبت کنید</h2>
        <p>برای ثبت سرویس، حداقل یک خودرو باید در برنامه وجود داشته باشد.</p>
        <a href="#/cars/new" class="btn btn--primary">افزودن خودرو</a>
      </div>`;
    return () => renderTabBar("#/services");
  }

  const existing = isEdit ? await ServicesAPI.getById(params.id) : null;
  if (isEdit && !existing) {
    navigate("#/services");
    return undefined;
  }
  let existingReminders = isEdit
    ? await RemindersAPI.getByCarId(existing.carId).then((rs) =>
        rs.filter((r) => r.serviceId === existing.id),
      )
    : [];

  const state = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: generateId(),
        carId: cars[0].id,
        centerName: "",
        date: todayJalaliStr(),
        km: "",
        oilChange: {
          done: false,
          oilName: "",
          grade: "",
          mileage: "",
          nextKm: "",
          cost: "",
        },
        serviceItems: [],
        goods: [],
        generalCost: "",
        reminders: [],
        description: "",
        title: "",
      };
  state.reminders = existingReminders.map((r) => ({ ...r }));

  function getCar() {
    return cars.find((c) => c.id === state.carId);
  }

  root.innerHTML = `
    <header class="page-header page-header--form">
      <a href="#/services" class="page-header__back sf">${acIcon("chevron-right")}</a>
      <h1>${isEdit ? "ویرایش سرویس" : "ثبت سرویس"}</h1>
    </header>
    <form class="form-stack service-form" novalidate>
      <div class="card service-form__car-card">
        <div class="field"><label>خودرو</label><div class="service-car-combo"></div></div>
        <p style="margin-top: 7px;" class="service-form__car-km"></p>
      </div>

      <div class="field">
        <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("company-account")}</span>نام مرکز خدماتی</label>
        <input type="text" class="text-input" id="center-name-input" value="${escapeHtml(state.centerName || "")}" placeholder="مثال: تعویض روغن الماس" />
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("calendar")}</span>تاریخ انجام سرویس</label>
          <button type="button" class="text-input text-input--button" id="service-date-btn">${toFaDigits(state.date)}</button>
        </div>
        <div class="field">
          <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("odometer")}</span>کیلومتر سرویس</label>
          <input type="tel" inputmode="numeric" class="text-input" id="service-km-input" value="${formatNumberFa(state.km || "")}" />
        </div>
      </div>

      <section style="margin-top: -3px;" class="section-block">
      <label class="field__label-with-icon"><span class="sf field__label-icon">${acIcon("engine-oil")}</span>تعویض روغن</label>
        <button type="button" class="oil-toggle-btn text-input text-input--button ${state.oilChange.done ? "is-active" : ""}">
          ${state.oilChange.done ? "انجام شده" : "انجام نشده"}
        </button>
        <div class="oil-fields" style="display:${state.oilChange.done ? "" : "none"}"></div>
      </section>

      <section class="section-block">
        <div class="section-block__header">
          <h2>خدمات سرویس</h2>
          <button type="button" class="btn btn--secondary btn--small" id="add-service-item-btn">افزودن خدمات</button>
        </div>
        <div class="service-items-list"></div>
      </section>

      <section class="section-block">
        <div class="section-block__header">
          <h2>کالاها</h2>
          <button type="button" class="btn btn--secondary btn--small" id="add-goods-btn">ثبت کالا</button>
        </div>
        <div class="goods-list"></div>
      </section>

      <section class="section-block">
        <div class="section-block__header"><h2>هزینه‌ها</h2></div>
        <div class="field"><label>هزینه کلی سرویس</label><input type="tel" inputmode="numeric" class="text-input" id="general-cost-input" value="${formatNumberFa(state.generalCost || "")}" /></div>
      </section>

      <section class="section-block">
        <div class="section-block__header"><h2>صورتحساب</h2></div>
        <div class="invoice-preview card"></div>
      </section>

      <section class="section-block">
        <div class="section-block__header">
          <h2>یادآوری</h2>
          <button type="button" class="btn btn--secondary btn--small" id="add-reminder-btn">ایجاد یادآور</button>
        </div>
        <div class="reminders-list"></div>
      </section>

      <div class="field">
        <label>توضیحات (اختیاری)</label>
        <textarea class="text-input text-area" id="service-desc-input" rows="3">${escapeHtml(state.description || "")}</textarea>
      </div>
      <div class="field">
        <label>عنوان سرویس (اختیاری)</label>
        <input type="text" class="text-input" id="service-title-input" value="${escapeHtml(state.title || "")}" />
      </div>

      <button type="submit" class="btn btn--primary btn--block">${isEdit ? "ذخیره تغییرات" : "ثبت سرویس"}</button>
      ${isEdit ? '<button type="button" class="btn btn--destructive btn--block service-form__delete">حذف سرویس</button>' : ""}
    </form>
  `;

  const form = root.querySelector(".service-form");

  // خودرو
  const carComboWrap = root.querySelector(".service-car-combo");
  const carKmEl = root.querySelector(".service-form__car-km");
  function renderCarCombo() {
    carComboWrap.innerHTML = "";
    carComboWrap.appendChild(
      createCombobox({
        items: cars.map((c) => ({ value: c.id, label: c.brandModel })),
        value: state.carId,
        placeholder: "انتخاب خودرو",
        autoFocus: false,
        onSelect: (item) => {
          state.carId = item.value;
          const car = cars.find((c) => c.id === item.value);
          if (car && car.currentKm) {
            serviceKmRaw = String(car.currentKm);
            const kmInput = root.querySelector("#service-km-input");
            if (kmInput) kmInput.value = formatNumberFa(car.currentKm);
          }
          renderCarCombo();
        },
      }),
    );
    const car = getCar();
    carKmEl.textContent = car
      ? `کیلومتر فعلی خودرو: ${formatKm(car.currentKm)}`
      : "";
  }
  renderCarCombo();

  // تاریخ
  root.querySelector("#service-date-btn").addEventListener("click", () => {
    openJalaliDatePicker({
      value: state.date,
      onSelect: (d) => {
        state.date = d;
        root.querySelector("#service-date-btn").textContent = toFaDigits(d);
      },
    });
  });

  // کیلومتر سرویس (فرمت زنده با جداکننده هزارگان)
  let serviceKmRaw = state.km ? String(state.km) : "";
  bindThousandsInput(root.querySelector("#service-km-input"), (raw) => {
    serviceKmRaw = raw;
  });

  // تعویض روغن
  const oilToggleBtn = root.querySelector(".oil-toggle-btn");
  const oilFieldsWrap = root.querySelector(".oil-fields");
  function renderOilFields() {
    oilFieldsWrap.innerHTML = `
      <div style="margin-top: 7px;" class="field"><label>نام روغن</label><input type="text" class="text-input" id="oil-name-input" value="${escapeHtml(state.oilChange.oilName || "")}" /></div>
      <div style="margin-top: 7px;" class="field-row">
        <div class="field"><label>گرید روغن موتور</label><input type="text" class="text-input" id="oil-grade-input" value="${escapeHtml(state.oilChange.grade || "")}" placeholder="مثال: 5W-40" /></div>
        <div class="field"><label>کارکرد روغن موتور</label><input type="tel" inputmode="numeric" class="text-input" id="oil-mileage-input" value="${formatNumberFa(state.oilChange.mileage || "")}" /></div>
      </div>
      <div style="margin-top: 7px;" class="field-row">
        <div class="field"><label>کیلومتر بعدی</label><input type="tel" inputmode="numeric" class="text-input" id="oil-next-km-input" value="${formatNumberFa(state.oilChange.nextKm || "")}" /></div>
        <div class="field"><label>هزینه تعویض روغن</label><input type="tel" inputmode="numeric" class="text-input" id="oil-cost-input" value="${formatNumberFa(state.oilChange.cost || "")}" /></div>
      </div>
    `;
    const bindText = (id, key) =>
      oilFieldsWrap.querySelector(id).addEventListener("input", (e) => {
        state.oilChange[key] = e.target.value;
        renderInvoice();
      });
    const bindNumeric = (id, key) =>
      bindThousandsInput(oilFieldsWrap.querySelector(id), (raw) => {
        state.oilChange[key] = raw;
        renderInvoice();
      });
    bindText("#oil-name-input", "oilName");
    bindText("#oil-grade-input", "grade");
    bindNumeric("#oil-mileage-input", "mileage");
    bindNumeric("#oil-next-km-input", "nextKm");
    bindNumeric("#oil-cost-input", "cost");
  }
  oilToggleBtn.addEventListener("click", () => {
    state.oilChange.done = !state.oilChange.done;
    oilToggleBtn.classList.toggle("is-active", state.oilChange.done);
    oilToggleBtn.textContent = state.oilChange.done
      ? "انجام شده"
      : "انجام نشده";
    oilFieldsWrap.style.display = state.oilChange.done ? "" : "none";
    if (state.oilChange.done) renderOilFields();
    renderInvoice();
  });
  if (state.oilChange.done) renderOilFields();

  // خدمات سرویس
  const serviceItemsListEl = root.querySelector(".service-items-list");
  function renderServiceItems() {
    serviceItemsListEl.innerHTML = "";
    if (!state.serviceItems.length) {
      serviceItemsListEl.innerHTML =
        '<p class="empty-state__inline">خدمتی افزوده نشده است.</p>';
      return;
    }
    state.serviceItems.forEach((item, idx) => {
      if (item.note == null) item.note = "";
      const card = document.createElement("div");
      card.className = "svc-item-row";
      card.innerHTML = `
        <div class="svc-item-row__main">
          <p class="svc-item-row__title">${escapeHtml(item.title)}</p>
          ${item.status ? statusPillHtml(item.status) : ""}
        </div>
        <div class="svc-item-row__footer">
          <input type="tel" inputmode="numeric" class="text-input svc-item-row__cost"
            placeholder="هزینه (اختیاری)" value="${item.cost ? formatNumberFa(item.cost) : ""}" />
          <input type="text" class="text-input svc-item-row__note"
            placeholder="توضیحات (اختیاری)" value="${escapeHtml(item.note || "")}" />
          <button type="button" class="svc-item-row__remove sf" aria-label="حذف">${acIcon("close")}</button>
        </div>
      `;
      card
        .querySelector(".svc-item-row__note")
        .addEventListener("input", (e) => {
          item.note = e.target.value;
        });
      bindThousandsInput(card.querySelector(".svc-item-row__cost"), (raw) => {
        item.cost = raw;
        renderInvoice();
      });
      card
        .querySelector(".svc-item-row__remove")
        .addEventListener("click", () => {
          state.serviceItems.splice(idx, 1);
          renderServiceItems();
          renderInvoice();
        });
      serviceItemsListEl.appendChild(card);
    });
  }
  renderServiceItems();

  root.querySelector("#add-service-item-btn").addEventListener("click", () =>
    openServiceItemsCatalog(catalog, state, () => {
      renderServiceItems();
      renderInvoice();
    }),
  );

  // کالاها
  const goodsListEl = root.querySelector(".goods-list");
  function renderGoods() {
    goodsListEl.innerHTML = "";
    if (!state.goods.length) {
      goodsListEl.innerHTML =
        '<p class="empty-state__inline">کالایی ثبت نشده است.</p>';
      return;
    }
    state.goods.forEach((g, idx) => {
      const card = document.createElement("div");
      card.className = "mini-card";
      const sub =
        g.type === "item"
          ? `${toFaDigits(g.qty)} × ${formatToman(g.unitPrice)} = ${formatToman(g.amount)}`
          : formatToman(g.amount);
      card.innerHTML = `
        <div class="mini-card__info"><p class="mini-card__title">${escapeHtml(g.title)}</p><p class="mini-card__sub">${sub}</p></div>
        <button type="button" class="mini-card__remove sf" aria-label="حذف">${acIcon("close")}</button>
      `;
      card.querySelector(".mini-card__remove").addEventListener("click", () => {
        state.goods.splice(idx, 1);
        renderGoods();
        renderInvoice();
      });
      goodsListEl.appendChild(card);
    });
  }
  renderGoods();

  root.querySelector("#add-goods-btn").addEventListener("click", () =>
    openGoodsEntrySheet(state, () => {
      renderGoods();
      renderInvoice();
    }),
  );

  // هزینه کلی
  bindThousandsInput(root.querySelector("#general-cost-input"), (raw) => {
    state.generalCost = raw;
    renderInvoice();
  });

  // صورتحساب زنده
  const invoiceEl = root.querySelector(".invoice-preview");
  function renderInvoice() {
    const rows = [];
    if (state.oilChange.done) rows.push(["تعویض روغن", state.oilChange.cost]);
    if (state.serviceItems.length)
      rows.push([
        "خدمات سرویس",
        state.serviceItems.reduce((s, i) => s + (Number(i.cost) || 0), 0),
      ]);
    if (state.goods.length)
      rows.push([
        "کالاها/لوازم",
        state.goods.reduce((s, g) => s + (Number(g.amount) || 0), 0),
      ]);
    if (state.generalCost) rows.push(["هزینه کلی سرویس", state.generalCost]);
    const total = computeTotalCost(state);
    invoiceEl.innerHTML = `
      ${rows.map(([label, val]) => `<div class="invoice-preview__row"><span>${label}</span><span>${formatToman(val)}</span></div>`).join("")}
      ${!rows.length ? '<p class="empty-state__inline">هنوز هزینه‌ای ثبت نشده</p>' : ""}
      <div class="invoice-preview__divider"></div>
      <div class="invoice-preview__total"><span>جمع کل هزینه‌ها</span><span>${formatToman(total)}</span></div>
    `;
  }
  renderInvoice();

  // یادآوری
  const remindersListEl = root.querySelector(".reminders-list");
  function renderReminders() {
    remindersListEl.innerHTML = "";
    if (!state.reminders.length) {
      remindersListEl.innerHTML =
        '<p class="empty-state__inline">یادآوری ثبت نشده است.</p>';
      return;
    }
    state.reminders.forEach((r, idx) => {
      const card = document.createElement("div");
      card.className = "mini-card";
      const sub =
        r.mode === "date"
          ? `تاریخ: ${toFaDigits(r.dateValue || "")}`
          : `کیلومتر: ${formatKm(r.kmValue)}`;
      card.innerHTML = `
        <div class="mini-card__info"><p class="mini-card__title">${escapeHtml(r.title)}</p><p class="mini-card__sub">${sub}</p></div>
        <button type="button" class="mini-card__remove sf" aria-label="حذف">${acIcon("close")}</button>
      `;
      card.querySelector(".mini-card__remove").addEventListener("click", () => {
        state.reminders.splice(idx, 1);
        renderReminders();
      });
      remindersListEl.appendChild(card);
    });
  }
  renderReminders();

  root
    .querySelector("#add-reminder-btn")
    .addEventListener("click", () =>
      openReminderEntrySheet(state, () => renderReminders()),
    );

  // ثبت نهایی
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.km = serviceKmRaw;
    state.centerName = root.querySelector("#center-name-input").value.trim();
    state.description = root.querySelector("#service-desc-input").value.trim();
    state.title = root.querySelector("#service-title-input").value.trim();
    if (!state.carId) {
      showToast("لطفا خودرو را انتخاب کنید", "error");
      return;
    }
    if (!state.date) {
      showToast("لطفا تاریخ سرویس را انتخاب کنید", "error");
      return;
    }
    if (!serviceKmRaw || Number(serviceKmRaw) <= 0) {
      showToast("لطفا کیلومتر سرویس را وارد کنید", "error");
      return;
    }
    const hasAnyWork =
      state.oilChange.done ||
      (state.serviceItems && state.serviceItems.length) ||
      (state.goods && state.goods.length) ||
      Number(state.generalCost) > 0 ||
      state.description;
    if (!hasAnyWork) {
      showToast("حداقل یک خدمت، کالا، هزینه یا توضیحات ثبت کنید", "error");
      return;
    }
    state.totalCost = computeTotalCost(state);
    state.updatedAt = new Date().toISOString();
    if (!state.createdAt) state.createdAt = new Date().toISOString();

    const reminders = state.reminders;
    const serviceToSave = { ...state };
    delete serviceToSave.reminders;
    await ServicesAPI.save(serviceToSave);

    // همگام‌سازی تعویض روغن با لیست نگهداری
    await syncOilMaintenanceFromService(serviceToSave);

    // به‌روزرسانی کیلومتر خودرو در صورتی که بیشتر از مقدار فعلی باشد
    const car = getCar();
    if (car && state.km && Number(state.km) > Number(car.currentKm || 0)) {
      car.currentKm = Number(state.km);
      car.kmUpdatedAt = state.date;
      await CarsAPI.save(car);
    }

    // ذخیره یادآورها (حذف قبلی‌ها و ثبت مجدد برای این سرویس)
    await Promise.all(existingReminders.map((r) => RemindersAPI.delete(r.id)));
    await Promise.all(
      reminders.map((r) =>
        RemindersAPI.save({
          id: r.id || generateId(),
          carId: state.carId,
          serviceId: state.id,
          title: r.title,
          mode: r.mode,
          dateValue: r.dateValue || null,
          kmValue: r.kmValue || null,
          note: r.note || "",
          done: false,
          createdAt: new Date().toISOString(),
        }),
      ),
    );

    showToast(isEdit ? "تغییرات سرویس ذخیره شد" : "سرویس ثبت شد", "success");
    navigate("#/services");
  });

  if (isEdit) {
    root
      .querySelector(".service-form__delete")
      .addEventListener("click", async () => {
        const ok = await showAlert({
          title: "حذف سرویس",
          message: "این سرویس برای همیشه حذف خواهد شد. آیا مطمئن هستید؟",
          confirmText: "حذف",
          destructive: true,
        });
        if (!ok) return;
        await ServicesAPI.delete(state.id);
        await Promise.all(
          existingReminders.map((r) => RemindersAPI.delete(r.id)),
        );
        showToast("سرویس حذف شد", "success");
        navigate("#/services");
      });
  }

  return () => renderTabBar("#/services");
}

/** صفحه/شیت خدمات سرویس باز (2.3) */
function openServiceItemsCatalog(catalog, state, onDone) {
  const sheet = openSheet({ title: "خدمات سرویس", size: "full" });
  const wrap = document.createElement("div");
  wrap.className = "catalog-page";
  wrap.innerHTML = `
    <div class="field"><input type="text" class="text-input" placeholder="جستجو در خدمات…" id="catalog-search-input" /></div>
    <button type="button" class="btn btn--secondary btn--block" id="add-custom-service-btn">+ خدمت دلخواه</button>
    <div class="catalog-list"></div>
  `;
  sheet.body.appendChild(wrap);
  const listEl = wrap.querySelector(".catalog-list");

  function paintStatusSegments(segEl) {
    segEl.querySelectorAll(".segmented__item").forEach((btn) => {
      const label = btn.textContent.trim();
      const c = getServiceStatusColor(label);
      btn.classList.add("segmented__item--status");
      btn.style.setProperty("--status-fg", c.fg);
      btn.style.setProperty("--status-bg", c.bg);
    });
  }

  function renderCatalogList(filter = "") {
    listEl.innerHTML = "";
    const f = filter.trim();
    catalog
      .filter((c) => !f || c.title.includes(f))
      .forEach((cat) => {
        const already = state.serviceItems.find((i) => i.catalogId === cat.id);
        const row = document.createElement("div");
        row.className = "catalog-row";
        row.innerHTML = `
          <span class="catalog-row__title">${escapeHtml(cat.title)}</span>
          <div class="catalog-row__seg"></div>
        `;
        const seg = row.querySelector(".catalog-row__seg");
        // دیگر کلاس catalog-row--added اضافه نمی‌شود (حاشیه آبی حذف شد)

        seg.appendChild(
          createSegmentedControl(
            cat.statuses,
            already ? already.status : null,
            (status) => {
              const existingIdx = state.serviceItems.findIndex(
                (i) => i.catalogId === cat.id,
              );
              // کلیک مجدد روی وضعیت انتخاب‌شده = لغو انتخاب
              if (
                existingIdx > -1 &&
                state.serviceItems[existingIdx].status === status
              ) {
                state.serviceItems.splice(existingIdx, 1);
                seg
                  .querySelectorAll(".segmented__item")
                  .forEach((b) => b.classList.remove("is-active"));
                return;
              }
              const cost =
                existingIdx > -1 ? state.serviceItems[existingIdx].cost : "";
              const entry = {
                catalogId: cat.id,
                title: cat.title,
                status,
                cost,
                note:
                  existingIdx > -1
                    ? state.serviceItems[existingIdx].note || ""
                    : "",
              };
              if (existingIdx > -1) state.serviceItems[existingIdx] = entry;
              else state.serviceItems.push(entry);
            },
          ),
        );

        // رنگ‌دهی وضعیت‌ها (بازدید شد / تعویض شد / …)
        paintStatusSegments(seg);

        listEl.appendChild(row);
      });
  }

  renderCatalogList();
  wrap
    .querySelector("#catalog-search-input")
    .addEventListener("input", (e) => renderCatalogList(e.target.value));

  wrap
    .querySelector("#add-custom-service-btn")
    .addEventListener("click", () => {
      const innerSheet = openSheet({ title: "خدمت دلخواه", size: "small" });
      const f = document.createElement("div");
      f.className = "form-stack";
      f.innerHTML = `
        <div class="field"><label>عنوان</label><input type="text" class="text-input" id="custom-title-input" /></div>
        <div class="field"><label>توضیحات</label><input type="text" class="text-input" id="custom-desc-input" placeholder="مثال: انجام شد" /></div>
        <button type="button" class="btn btn--primary btn--block" id="custom-add-btn">افزودن به سرویس</button>
      `;
      innerSheet.body.appendChild(f);
      f.querySelector("#custom-add-btn").addEventListener("click", () => {
        const title = f.querySelector("#custom-title-input").value.trim();
        const desc =
          f.querySelector("#custom-desc-input").value.trim() || "انجام شد";
        if (!title) {
          showToast("عنوان را وارد کنید", "error");
          return;
        }
        state.serviceItems.push({
          catalogId: "custom-" + generateId(),
          title,
          status: desc,
          cost: "",
          note: "",
        });
        innerSheet.close();
        showToast("به سرویس افزوده شد", "success");
      });
    });

  sheet.el.addEventListener("click", (e) => {
    if (e.target === sheet.el) onDone();
  });
  sheet.body.parentElement
    .querySelector(".sheet__close")
    .addEventListener("click", onDone);
}

/** شیت ثبت کالا/هزینه */
function openGoodsEntrySheet(state, onDone) {
  const sheet = openSheet({ title: "ثبت کالا", size: "default" });
  let mode = "item";
  const wrap = document.createElement("div");
  wrap.className = "form-stack";
  wrap.innerHTML = `<div class="goods-mode-toggle"></div><div class="goods-fields"></div>
    <button type="button" class="btn btn--primary btn--block" id="goods-add-btn">افزودن به سرویس</button>`;
  sheet.body.appendChild(wrap);
  const fieldsEl = wrap.querySelector(".goods-fields");

  function renderFields() {
    if (mode === "item") {
      fieldsEl.innerHTML = `
        <div class="field"><label>عنوان کالا</label><input type="text" class="text-input" id="goods-title-input" /></div>
        <div class="field">
          <label>قیمت یک واحد</label>
          <div class="goods-price-row">
            <input type="tel" inputmode="numeric" class="text-input" id="goods-price-input" placeholder="قیمت" />
            <div class="stepper stepper--inline">
              <button type="button" class="stepper__btn" id="stepper-minus">−</button>
              <span class="stepper__value" id="stepper-value">۱</span>
              <button type="button" class="stepper__btn" id="stepper-plus">+</button>
            </div>
          </div>
        </div>
      `;
      let qty = 1;
      const valueEl = fieldsEl.querySelector("#stepper-value");
      fieldsEl.querySelector("#stepper-minus").addEventListener("click", () => {
        qty = Math.max(1, qty - 1);
        valueEl.textContent = toFaDigits(qty);
        fieldsEl.dataset.qty = qty;
      });
      fieldsEl.querySelector("#stepper-plus").addEventListener("click", () => {
        qty += 1;
        valueEl.textContent = toFaDigits(qty);
        fieldsEl.dataset.qty = qty;
      });
      fieldsEl.dataset.qty = "1";
    } else {
      fieldsEl.innerHTML = `
        <div class="field"><label>عنوان هزینه</label><input type="text" class="text-input" id="goods-title-input" /></div>
        <div class="field"><label>مقدار هزینه</label><input type="tel" inputmode="numeric" class="text-input" id="goods-price-input" /></div>
      `;
    }
    bindThousandsInput(fieldsEl.querySelector("#goods-price-input"), () => {});
  }
  wrap.querySelector(".goods-mode-toggle").appendChild(
    createSegmentedControl(["کالا", "هزینه"], "کالا", (val) => {
      mode = val === "کالا" ? "item" : "cost";
      renderFields();
    }),
  );
  renderFields();

  wrap.querySelector("#goods-add-btn").addEventListener("click", () => {
    const title = fieldsEl.querySelector("#goods-title-input").value.trim();
    const priceRaw = toEnDigits(
      fieldsEl.querySelector("#goods-price-input").value,
    ).replace(/[^\d]/g, "");
    if (!title) {
      showToast("عنوان را وارد کنید", "error");
      return;
    }
    if (mode === "item") {
      const qty = Number(fieldsEl.dataset.qty || 1);
      const unitPrice = Number(priceRaw) || 0;
      state.goods.push({
        type: "item",
        title,
        unitPrice,
        qty,
        amount: unitPrice * qty,
      });
    } else {
      state.goods.push({ type: "cost", title, amount: Number(priceRaw) || 0 });
    }
    sheet.close();
    onDone();
    showToast("به سرویس افزوده شد", "success");
  });
}

/** شیت ایجاد یادآور */
function openReminderEntrySheet(state, onDone) {
  const sheet = openSheet({ title: "ایجاد یادآوری", size: "default" });
  const wrap = document.createElement("div");
  wrap.className = "form-stack";
  wrap.innerHTML = `
    <div class="field"><label>عنوان یادآوری</label><div class="reminder-title-combo"></div></div>
    <div class="field"><label>نوع یادآور</label><div class="reminder-mode-toggle"></div></div>
    <div class="field reminder-value-field"></div>
    <div class="field"><label>یادداشت (اختیاری)</label><input type="text" class="text-input" id="reminder-note-input" /></div>
    <button type="button" class="btn btn--primary btn--block" id="reminder-add-btn">ثبت یادآوری</button>
  `;
  sheet.body.appendChild(wrap);
  let selectedTitle = REMINDER_TITLES[0];
  let mode = "date";
  let dateValue = todayJalaliStr();
  let kmValue = "";

  wrap.querySelector(".reminder-title-combo").appendChild(
    createCombobox({
      items: REMINDER_TITLES.map((t) => ({ value: t, label: t })),
      value: selectedTitle,
      placeholder: "انتخاب عنوان",
      onSelect: (item) => {
        selectedTitle = item.value;
      },
    }),
  );

  const valueField = wrap.querySelector(".reminder-value-field");
  function renderValueField() {
    if (mode === "date") {
      valueField.innerHTML = `<label>تاریخ یادآوری</label><button type="button" class="text-input text-input--button" id="reminder-date-btn">${toFaDigits(dateValue)}</button>`;
      valueField
        .querySelector("#reminder-date-btn")
        .addEventListener("click", () => {
          openJalaliDatePicker({
            value: dateValue,
            onSelect: (d) => {
              dateValue = d;
              valueField.querySelector("#reminder-date-btn").textContent =
                toFaDigits(d);
            },
          });
        });
    } else {
      valueField.innerHTML = `<label>کیلومتر یادآوری</label><input type="tel" inputmode="numeric" class="text-input" id="reminder-km-input" value="${kmValue ? formatNumberFa(kmValue) : ""}" />`;
      bindThousandsInput(
        valueField.querySelector("#reminder-km-input"),
        (raw) => {
          kmValue = raw;
        },
      );
    }
  }
  wrap.querySelector(".reminder-mode-toggle").appendChild(
    createSegmentedControl(["تاریخ", "کیلومتر"], "تاریخ", (val) => {
      mode = val === "تاریخ" ? "date" : "km";
      renderValueField();
    }),
  );
  renderValueField();

  wrap.querySelector("#reminder-add-btn").addEventListener("click", () => {
    if (mode === "km" && !kmValue) {
      showToast("مقدار کیلومتر را وارد کنید", "error");
      return;
    }
    state.reminders.push({
      id: generateId(),
      title: selectedTitle,
      mode,
      dateValue: mode === "date" ? dateValue : null,
      kmValue: mode === "km" ? Number(kmValue) : null,
      note: wrap.querySelector("#reminder-note-input").value.trim(),
    });
    sheet.close();
    onDone();
    showToast("یادآوری ثبت شد", "success");
  });
}

/* ==================================================
   صفحه نگهداری خودرو
   ================================================== */

async function renderMaintenancePage(params, root) {
  renderTabBar("#/dashboard");
  removeFab();

  const cars = await CarsAPI.getAll();
  if (!cars.length) {
    root.innerHTML = `
      <header class="page-header page-header--form">
        <a href="#/dashboard" class="page-header__back sf">${acIcon("chevron-right")}</a>
        <h1>نگهداری خودرو</h1>
      </header>
      <div class="empty-state">
        <span class="empty-state__icon sf">${acIcon("car-front")}</span>
        <h2>ابتدا یک خودرو ثبت کنید</h2>
        <a href="#/cars/new" class="btn btn--primary">افزودن خودرو</a>
      </div>`;
    return;
  }

  let activeCarId =
    window.__dashboardActiveCarId &&
    cars.some((c) => c.id === window.__dashboardActiveCarId)
      ? window.__dashboardActiveCarId
      : cars[0].id;

  root.innerHTML = `
    <header class="page-header page-header--form">
      <a href="#/dashboard" class="page-header__back sf">${acIcon("chevron-right")}</a>
      <h1>نگهداری خودرو</h1>
    </header>
    <section class="dash-car-strip maint-page__strip"></section>
    <div class="maint-page__list"></div>
  `;

  const strip = root.querySelector(".maint-page__strip");
  const listEl = root.querySelector(".maint-page__list");

  function renderStrip() {
    strip.innerHTML = "";
    cars.forEach((car) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "dash-car-chip" + (car.id === activeCarId ? " is-active" : "");
      chip.innerHTML = `<span class="dash-car-chip__name">${escapeHtml(car.brandModel || "خودرو")}</span>`;
      chip.addEventListener("click", () => {
        activeCarId = car.id;
        window.__dashboardActiveCarId = car.id;
        renderStrip();
        renderList();
      });
      strip.appendChild(chip);
    });
  }

  async function renderList() {
    const car = cars.find((c) => c.id === activeCarId);
    if (!car) return;
    const allRecords = await MaintenanceAPI.getByCarId(car.id);
    const latestMap = await MaintenanceAPI.getLatestByCarId(car.id);
    const currentKm = Number(car.currentKm) || 0;

    // اگر روغن فقط در سرویس باشد و در نگهداری نباشد، به‌صورت موقت نمایش بده
    if (!latestMap["engine-oil"]) {
      const services = await ServicesAPI.getByCarId(car.id);
      const lastOil = services
        .filter((s) => s.oilChange && s.oilChange.done)
        .sort(
          (a, b) =>
            (jalaliStrToDate(b.date) || 0) - (jalaliStrToDate(a.date) || 0),
        )[0];
      if (lastOil) {
        const oil = lastOil.oilChange;
        let lifeKm = Number(oil.mileage) || 0;
        const nextKm = Number(oil.nextKm) || 0;
        const serviceKm = Number(lastOil.km) || 0;
        if (!lifeKm && nextKm > serviceKm) lifeKm = nextKm - serviceKm;
        if (!lifeKm) lifeKm = 5000;
        latestMap["engine-oil"] = {
          id: null,
          partId: "engine-oil",
          title: "روغن موتور",
          replacedKm: serviceKm,
          replacedDate: lastOil.date,
          lifeKm,
          source: "service-derived",
        };
      }
    }

    const items = Object.values(latestMap).sort((a, b) => {
      // روغن موتور همیشه اول
      if (a.partId === "engine-oil" && b.partId !== "engine-oil") return -1;
      if (b.partId === "engine-oil" && a.partId !== "engine-oil") return 1;
      // بقیه: بحرانی‌ترها بالاتر
      const ga = computePartGauge(currentKm, a.replacedKm, a.lifeKm);
      const gb = computePartGauge(currentKm, b.replacedKm, b.lifeKm);
      return (gb.usedPercent || 0) - (ga.usedPercent || 0);
    });

    listEl.innerHTML = "";
    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon sf">${acIcon("diagnostics")}</span>
          <h2>هنوز قطعه‌ای ثبت نشده</h2>
          <p>با دکمه «+ نگهداری» اولین تعویض قطعه را ثبت کنید.</p>
        </div>`;
      return;
    }

    items.forEach((rec) => {
      const gauge = computePartGauge(currentKm, rec.replacedKm, rec.lifeKm);
      const meta = [
        rec.replacedDate ? `تاریخ: ${toFaDigits(rec.replacedDate)}` : "",
        rec.replacedKm != null ? `کیلومتر: ${formatKm(rec.replacedKm)}` : "",
        rec.lifeKm ? `عمر: ${formatKm(rec.lifeKm)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const card = document.createElement("div");
      card.className = "maint-item-card";
      card.innerHTML = `
        ${renderCircleGaugeHtml(rec.title || rec.partId, gauge, meta)}
        <div class="maint-item-card__actions">
          ${
            rec.id
              ? `<button type="button" class="btn btn--secondary btn--small maint-edit-btn">ویرایش</button>
                 <button type="button" class="btn btn--destructive btn--small maint-delete-btn">حذف</button>`
              : `<p class="maint-item-card__hint">از سرویس روغن مشتق شده — با ثبت سرویس بعدی به‌روز می‌شود</p>`
          }
        </div>
      `;
      if (rec.id) {
        card.querySelector(".maint-edit-btn").addEventListener("click", () => {
          openMaintenanceFormSheet({
            mode: "edit",
            record: rec,
            car,
            onDone: renderList,
          });
        });
        card
          .querySelector(".maint-delete-btn")
          .addEventListener("click", async () => {
            const ok = await showAlert({
              title: "حذف رکورد نگهداری",
              message: `«${rec.title}» حذف شود؟`,
              confirmText: "حذف",
              destructive: true,
            });
            if (!ok) return;
            await MaintenanceAPI.delete(rec.id);
            showToast("حذف شد", "success");
            renderList();
          });
      }
      listEl.appendChild(card);
    });
  }

  renderStrip();
  await renderList();

  renderFab("نگهداری", () => {
    const car = cars.find((c) => c.id === activeCarId);
    openMaintenancePartPicker(car, () => renderList());
  });
}

/** انتخاب قطعه از فهرست DEFAULT_PARTS سپس فرم ثبت */
function openMaintenancePartPicker(car, onDone) {
  const sheet = openSheet({ title: "انتخاب قطعه", size: "full" });
  const wrap = document.createElement("div");
  wrap.className = "catalog-page";
  wrap.innerHTML = `
    <div class="field"><input type="text" class="text-input" placeholder="جستجو در قطعات…" id="part-search-input" /></div>
    <div class="catalog-list part-picker-list"></div>
  `;
  sheet.body.appendChild(wrap);
  const listEl = wrap.querySelector(".part-picker-list");

  function renderParts(filter = "") {
    listEl.innerHTML = "";
    const f = filter.trim();
    DEFAULT_PARTS.filter((p) => !f || p.title.includes(f)).forEach((part) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "combobox__row part-picker-row";
      row.innerHTML = `
        <span class="part-picker-row__title">${escapeHtml(part.title)}</span>
        <span class="part-picker-row__life">عمر پیش‌فرض: ${formatKm(part.defaultLifeKm)}</span>
      `;
      row.addEventListener("click", () => {
        sheet.close();
        openMaintenanceFormSheet({
          mode: "new",
          part,
          car,
          onDone,
        });
      });
      listEl.appendChild(row);
    });
    if (!listEl.children.length) {
      listEl.innerHTML = '<p class="combobox__empty">موردی یافت نشد</p>';
    }
  }
  renderParts();
  wrap.querySelector("#part-search-input").addEventListener("input", (e) => {
    renderParts(e.target.value);
  });
}

/** فرم ثبت / ویرایش نگهداری یک قطعه */
function openMaintenanceFormSheet({ mode, part, record, car, onDone }) {
  const isEdit = mode === "edit";
  const partMeta = part ||
    DEFAULT_PARTS.find((p) => p.id === (record && record.partId)) || {
      id: record?.partId || "custom",
      title: record?.title || "قطعه",
      defaultLifeKm: record?.lifeKm || 10000,
    };

  const sheet = openSheet({
    title: isEdit ? "ویرایش نگهداری" : `ثبت · ${partMeta.title}`,
    size: "default",
  });

  let replacedKm = isEdit
    ? String(record.replacedKm || "")
    : String(car.currentKm || "");
  let lifeKm = isEdit
    ? String(record.lifeKm || partMeta.defaultLifeKm)
    : String(partMeta.defaultLifeKm);
  let replacedDate = isEdit
    ? record.replacedDate || todayJalaliStr()
    : todayJalaliStr();

  const form = document.createElement("div");
  form.className = "form-stack";
  form.innerHTML = `
    <div class="field">
      <label>نام قطعه</label>
      <input type="text" class="text-input" id="maint-title-input" value="${escapeHtml(isEdit ? record.title : partMeta.title)}" ${isEdit ? "" : "readonly"} />
    </div>
    <div class="field">
      <label>کیلومتر تعویض</label>
      <input type="tel" inputmode="numeric" class="text-input" id="maint-km-input" value="${formatNumberFa(replacedKm)}" />
    </div>
    <div class="field">
      <label>تاریخ تعویض</label>
      <button type="button" class="text-input text-input--button" id="maint-date-btn">${toFaDigits(replacedDate)}</button>
    </div>
    <div class="field">
      <label>عمر مفید (کیلومتر)</label>
      <input type="tel" inputmode="numeric" class="text-input" id="maint-life-input" value="${formatNumberFa(lifeKm)}" />
      <p class="field__hint">پیش‌فرض: ${formatKm(partMeta.defaultLifeKm)} — در صورت نیاز تغییر دهید</p>
    </div>
    <div class="field">
      <label>یادداشت (اختیاری)</label>
      <input type="text" class="text-input" id="maint-note-input" value="${escapeHtml(isEdit ? record.note || "" : "")}" />
    </div>
    <button type="button" class="btn btn--primary btn--block" id="maint-save-btn">${isEdit ? "ذخیره تغییرات" : "ثبت"}</button>
  `;
  sheet.body.appendChild(form);

  bindThousandsInput(form.querySelector("#maint-km-input"), (raw) => {
    replacedKm = raw;
  });
  bindThousandsInput(form.querySelector("#maint-life-input"), (raw) => {
    lifeKm = raw;
  });
  form.querySelector("#maint-date-btn").addEventListener("click", () => {
    openJalaliDatePicker({
      value: replacedDate,
      onSelect: (d) => {
        replacedDate = d;
        form.querySelector("#maint-date-btn").textContent = toFaDigits(d);
      },
    });
  });

  form.querySelector("#maint-save-btn").addEventListener("click", async () => {
    if (!replacedKm || Number(replacedKm) <= 0) {
      showToast("کیلومتر تعویض را وارد کنید", "error");
      return;
    }
    if (!lifeKm || Number(lifeKm) <= 0) {
      showToast("عمر مفید را وارد کنید", "error");
      return;
    }
    const title =
      form.querySelector("#maint-title-input").value.trim() || partMeta.title;
    const note = form.querySelector("#maint-note-input").value.trim();
    const payload = {
      id: isEdit ? record.id : generateId(),
      carId: car.id,
      partId: partMeta.id,
      title,
      replacedKm: Number(replacedKm),
      replacedDate,
      lifeKm: Number(lifeKm),
      note,
      source: isEdit ? record.source || "manual" : "manual",
      serviceId: isEdit ? record.serviceId || null : null,
      createdAt: isEdit ? record.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await MaintenanceAPI.save(payload);
    sheet.close();
    showToast(isEdit ? "تغییرات ذخیره شد" : "قطعه ثبت شد", "success");
    if (onDone) onDone();
  });
}

/* ==================================================
   صفحه تنظیمات / پروفایل من
   ================================================== */

const APP_NAME = "آچارک (نسخه آزمایشی)";
const APP_VERSION = "1.0";

async function renderSettingsPage(params, root) {
  renderTabBar("#/settings");
  removeFab();
  const [reminders, cars] = await Promise.all([
    RemindersAPI.getAll(),
    CarsAPI.getAll(),
  ]);
  const carsById = Object.fromEntries(cars.map((c) => [c.id, c]));
  const currentTheme = await SettingsAPI.get("theme", "auto");

  const activeRemindersCount = reminders.filter((r) => !r.done).length;

  root.innerHTML = `
    <header class="page-header"><h1>تنظیمات</h1></header>

    <section class="section-block">
      <div class="section-block__header"><h2><span class="sf section-block__icon">${acIcon("bell")}</span>اعلان‌ها</h2></div>
      <button type="button" class="settings-nav-row" id="open-reminders-btn">
        <span class="settings-nav-row__icon sf">${acIcon("bell")}</span>
        <span class="settings-nav-row__text">
          <span class="settings-nav-row__title">مدیریت یادآوری‌ها</span>
          <span class="settings-nav-row__sub">${activeRemindersCount ? toFaDigits(activeRemindersCount) + " یادآوری فعال" : "یادآوری فعالی وجود ندارد"}</span>
        </span>
        <span class="settings-nav-row__chevron sf">${acIcon("chevron-left")}</span>
      </button>
    </section>

    <section class="section-block">
      <div class="section-block__header"><h2><span class="sf section-block__icon">${acIcon("theme")}</span>ظاهر برنامه</h2></div>
      <div class="theme-toggle"></div>
    </section>

    <section class="section-block">
      <div class="section-block__header"><h2><span class="sf section-block__icon">${acIcon("cloud-download-upload")}</span>پشتیبان‌گیری اطلاعات</h2></div>
      <div class="settings-actions">
        <button type="button" class="btn btn--secondary btn--block" id="backup-btn"><span class="sf">${acIcon("download-cloud")}</span>تهیه نسخه پشتیبان JSON</button>
        <label class="btn btn--secondary btn--block" for="import-file-input"><span class="sf">${acIcon("upload-cloud")}</span>ورود اطلاعات از فایل JSON</label>
        <input type="file" accept="application/json" id="import-file-input" style="display:none" />
      </div>
    </section>

    <p class="settings-footnote">${escapeHtml(APP_NAME)} · نسخه ${APP_VERSION}</p>
  `;

  // اعلان‌ها -> صفحه اختصاصی مدیریت یادآوری‌ها
  root.querySelector("#open-reminders-btn").addEventListener("click", () => {
    openRemindersManagerPage(reminders, carsById);
  });

  // تم
  root.querySelector(".theme-toggle").appendChild(
    createSegmentedControl(
      [
        { label: "خودکار", value: "خودکار", icon: "monitor" },
        { label: "روز", value: "روز", icon: "sun" },
        { label: "شب", value: "شب", icon: "moon" },
      ],
      currentTheme === "light"
        ? "روز"
        : currentTheme === "dark"
          ? "شب"
          : "خودکار",
      async (val) => {
        const mode = val === "روز" ? "light" : val === "شب" ? "dark" : "auto";
        await setTheme(mode);
        showToast("ظاهر برنامه تغییر کرد", "success");
      },
    ),
  );

  // پشتیبان‌گیری (JSON)
  root.querySelector("#backup-btn").addEventListener("click", async () => {
    await downloadBackupFile();
    showToast("نسخه پشتیبان ذخیره شد", "success");
  });
  root
    .querySelector("#import-file-input")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await showAlert({
        title: "ورود اطلاعات",
        message:
          "اطلاعات فایل انتخابی به اطلاعات فعلی افزوده می‌شود. آیا ادامه می‌دهید؟",
        confirmText: "ادامه",
      });
      if (!ok) return;
      try {
        const result = await importFromFile(file, "merge");
        showToast(
          `${toFaDigits(result.carsCount)} خودرو و ${toFaDigits(result.servicesCount)} سرویس وارد شد`,
          "success",
        );
        navigate("#/dashboard");
      } catch (err) {
        showToast(err.message || "خطا در وارد کردن فایل", "error");
      }
      e.target.value = "";
    });
}

/** صفحه اختصاصی مدیریت همه یادآوری‌ها (باز شده از دکمه «اعلان‌ها» در تنظیمات) */
function openRemindersManagerPage(reminders, carsById) {
  const sheet = openSheet({ title: "اعلان‌ها", size: "full" });
  const wrap = document.createElement("div");
  wrap.className = "reminders-manager";
  sheet.body.appendChild(wrap);

  function renderList() {
    wrap.innerHTML = "";
    if (!reminders.length) {
      wrap.innerHTML =
        '<p class="empty-state__inline">یادآوری فعالی وجود ندارد.</p>';
      return;
    }
    reminders
      .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1))
      .forEach((r) => {
        const car = carsById[r.carId];
        const card = document.createElement("div");
        card.className =
          "mini-card mini-card--reminder" + (r.done ? " is-done" : "");
        const sub =
          r.mode === "date"
            ? `تاریخ: ${toFaDigits(r.dateValue || "")}`
            : `کیلومتر: ${formatKm(r.kmValue)}`;
        card.innerHTML = `
          <label class="mini-card__checkbox-wrap">
            <input type="checkbox" ${r.done ? "checked" : ""} />
          </label>
          <div class="mini-card__info">
            <p class="mini-card__title">${escapeHtml(r.title)}</p>
            <p class="mini-card__sub">${escapeHtml(car ? car.brandModel : "")} · ${sub}${r.note ? " · " + escapeHtml(r.note) : ""}</p>
          </div>
          <button type="button" class="mini-card__edit sf" aria-label="ویرایش">${acIcon("edit")}</button>
          <button type="button" class="mini-card__remove sf" aria-label="حذف">${acIcon("close")}</button>
        `;
        card
          .querySelector('input[type="checkbox"]')
          .addEventListener("change", async (e) => {
            r.done = e.target.checked;
            await RemindersAPI.save(r);
            renderList();
          });
        card
          .querySelector(".mini-card__edit")
          .addEventListener("click", () =>
            openReminderEditSheet(r, () => renderList()),
          );
        card
          .querySelector(".mini-card__remove")
          .addEventListener("click", async () => {
            const ok = await showAlert({
              title: "حذف یادآوری",
              confirmText: "حذف",
              destructive: true,
            });
            if (!ok) return;
            await RemindersAPI.delete(r.id);
            reminders.splice(reminders.indexOf(r), 1);
            renderList();
            showToast("یادآوری حذف شد", "success");
          });
        wrap.appendChild(card);
      });
  }
  renderList();
}

/** شیت ویرایش مستقیم یک یادآوری (از صفحه مدیریت اعلان‌ها) */
function openReminderEditSheet(reminder, onDone) {
  const sheet = openSheet({ title: "ویرایش یادآوری", size: "default" });
  const wrap = document.createElement("div");
  wrap.className = "form-stack";
  wrap.innerHTML = `
    <div class="field"><label>عنوان یادآوری</label><div class="reminder-title-combo"></div></div>
    <div class="field"><label>نوع یادآور</label><div class="reminder-mode-toggle"></div></div>
    <div class="field reminder-value-field"></div>
    <div class="field"><label>یادداشت (اختیاری)</label><input type="text" class="text-input" id="reminder-note-input" value="${escapeHtml(reminder.note || "")}" /></div>
    <button type="button" class="btn btn--primary btn--block" id="reminder-save-btn">ذخیره تغییرات</button>
  `;
  sheet.body.appendChild(wrap);
  let mode = reminder.mode || "date";
  let dateValue = reminder.dateValue || todayJalaliStr();
  let kmValue = reminder.kmValue ? String(reminder.kmValue) : "";

  wrap.querySelector(".reminder-title-combo").appendChild(
    createCombobox({
      items: REMINDER_TITLES.map((t) => ({ value: t, label: t })),
      value: reminder.title,
      placeholder: "انتخاب عنوان",
      onSelect: (item) => {
        reminder.title = item.value;
      },
    }),
  );

  const valueField = wrap.querySelector(".reminder-value-field");
  function renderValueField() {
    if (mode === "date") {
      valueField.innerHTML = `<label>تاریخ یادآوری</label><button type="button" class="text-input text-input--button" id="reminder-date-btn">${toFaDigits(dateValue)}</button>`;
      valueField
        .querySelector("#reminder-date-btn")
        .addEventListener("click", () => {
          openJalaliDatePicker({
            value: dateValue,
            onSelect: (d) => {
              dateValue = d;
              valueField.querySelector("#reminder-date-btn").textContent =
                toFaDigits(d);
            },
          });
        });
    } else {
      valueField.innerHTML = `<label>کیلومتر یادآوری</label><input type="tel" inputmode="numeric" class="text-input" id="reminder-km-input" value="${kmValue ? formatNumberFa(kmValue) : ""}" />`;
      bindThousandsInput(
        valueField.querySelector("#reminder-km-input"),
        (raw) => {
          kmValue = raw;
        },
      );
    }
  }
  wrap.querySelector(".reminder-mode-toggle").appendChild(
    createSegmentedControl(
      ["تاریخ", "کیلومتر"],
      mode === "date" ? "تاریخ" : "کیلومتر",
      (val) => {
        mode = val === "تاریخ" ? "date" : "km";
        renderValueField();
      },
    ),
  );
  renderValueField();

  wrap
    .querySelector("#reminder-save-btn")
    .addEventListener("click", async () => {
      if (mode === "km" && !kmValue) {
        showToast("مقدار کیلومتر را وارد کنید", "error");
        return;
      }
      reminder.mode = mode;
      reminder.dateValue = mode === "date" ? dateValue : null;
      reminder.kmValue = mode === "km" ? Number(kmValue) : null;
      reminder.note = wrap.querySelector("#reminder-note-input").value.trim();
      await RemindersAPI.save(reminder);
      sheet.close();
      onDone();
      showToast("یادآوری به‌روزرسانی شد", "success");
    });
}

export { CAR_CATALOG, CAR_COLORS, FUEL_TYPES, setTheme };
