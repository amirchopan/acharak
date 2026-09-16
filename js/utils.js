/**
 * utils.js
 * توابع کمکی عمومی: تبدیل اعداد فارسی، تقویم جلالی، فرمت‌دهی و ...
 * بدون وابستگی خارجی - خالص جاوااسکریپت
 */

/* ==================== اعداد فارسی ==================== */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const EN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** تبدیل هر رشته/عدد شامل ارقام انگلیسی به فارسی */
function toFaDigits(input) {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** تبدیل ارقام فارسی/عربی داخل یک رشته به انگلیسی (برای پردازش داخلی) */
function toEnDigits(input) {
  if (input === null || input === undefined) return '';
  let s = String(input);
  FA_DIGITS.forEach((d, i) => { s = s.split(d).join(EN_DIGITS[i]); });
  // ارقام عربی هم پشتیبانی شود
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  AR_DIGITS.forEach((d, i) => { s = s.split(d).join(EN_DIGITS[i]); });
  return s;
}

/** فرمت عدد با جداکننده هزارگان و ارقام فارسی. مثال: 1800 -> ۱٬۸۰۰ */
function formatNumberFa(num) {
  if (num === null || num === undefined || num === '' || isNaN(Number(num))) return '';
  const n = Math.round(Number(num) * 100) / 100;
  const parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const joined = parts.join('.');
  return toFaDigits(joined);
}

/** فرمت تومان */
function formatToman(num) {
  if (num === null || num === undefined || num === '' || isNaN(Number(num)) || Number(num) === 0) return '۰ تومان';
  return formatNumberFa(num) + ' تومان';
}

/** فرمت کیلومتر */
function formatKm(num) {
  if (num === null || num === undefined || num === '') return '—';
  return formatNumberFa(num) + ' کیلومتر';
}

/* ==================== تقویم جلالی (شمسی) ==================== */
/** الگوریتم تبدیل میلادی <-> جلالی (بدون وابستگی خارجی) */

function div(a, b) { return ~~(a / b); }

function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4);
  if ((jump % 33) === 4 && (jump - n) === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if ((jump - n) < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function mod(a, b) { return a - ~~(a / b) * b; }

/** تبدیل تاریخ میلادی به شماره روز ژولین (Julian Day Number) */
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * mod(gm + 9, 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** تبدیل شماره روز ژولین به تاریخ میلادی */
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** تبدیل تاریخ جلالی به شماره روز ژولین */
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** تبدیل شماره روز ژولین به تاریخ جلالی */
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd, jm, k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (jalCal(jy).leap === 0) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/** تبدیل تاریخ جلالی به میلادی */
function jalToGregorian(jy, jm, jd) {
  const g = d2g(j2d(jy, jm, jd));
  return { gy: g.gy, gm: g.gm, gd: g.gd };
}

/** تبدیل تاریخ میلادی به جلالی */
function gregorianToJal(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

/** تبدیل تاریخ میلادی (Date) به رشته جلالی YYYY/MM/DD */
function gregorianToJalaliStr(date) {
  const j = gregorianToJal(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** تاریخ امروز به صورت جلالی */
function todayJalaliStr() {
  return gregorianToJalaliStr(new Date());
}

/** تبدیل رشته جلالی YYYY/MM/DD به آبجکت Date میلادی (برای مقایسه/مرتب‌سازی) */
function jalaliStrToDate(str) {
  if (!str) return null;
  const parts = toEnDigits(str).split('/').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const g = jalToGregorian(parts[0], parts[1], parts[2]);
  return new Date(g.gy, g.gm - 1, g.gd);
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function jalaliMonthDays(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند
  try { return jalCal(jy).leap === 0 ? 30 : 29; } catch (e) { return 29; }
}

function isJalaliLeapYear(jy) {
  try { return jalCal(jy).leap === 0; } catch (e) { return false; }
}

/* ==================== پلاک خودرو ایران ==================== */
/** حروف مجاز پلاک شخصی خودرو در ایران */
const PLATE_LETTERS = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'د', 'ز', 'ژ', 'س', 'ش', 'ص', 'ط', 'ع', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی', '♿︎', 'D', 'S'];

/** ساخت رشته نمایشی پلاک از آبجکت پلاک */
function formatPlate(plate) {
  if (!plate || !plate.part2 || !plate.letter || !plate.part1 || !plate.part3) return null;
  return `${toFaDigits(plate.part1)} ${plate.letter} ${toFaDigits(plate.part2)} — ${toFaDigits(plate.part3)} ایران`;
}

function isPlateComplete(plate) {
  if (!plate) return false;
  const filled = [plate.part1, plate.letter, plate.part2, plate.part3].filter((v) => v !== undefined && v !== null && v !== '');
  return filled.length === 4;
}

function isPlatePartial(plate) {
  if (!plate) return false;
  const filled = [plate.part1, plate.letter, plate.part2, plate.part3].filter((v) => v !== undefined && v !== null && v !== '');
  return filled.length > 0 && filled.length < 4;
}

/** جمع کردن یک سال شمسی به تاریخ (برای محاسبه خودکار تاریخ اعتبار) */
function addOneJalaliYear(str) {
  if (!str) return '';
  const parts = toEnDigits(str).split('/').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return '';
  let [jy, jm, jd] = parts;
  jy += 1;
  const maxDay = jalaliMonthDays(jy, jm);
  if (jd > maxDay) jd = maxDay;
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** یک سال بعد منهای یک روز (برای تاریخ پایان اعتبار بیمه‌نامه) */
function addOneJalaliYearMinusOneDay(str) {
  const plusYear = addOneJalaliYear(str);
  if (!plusYear) return '';
  const d = jalaliStrToDate(plusYear);
  if (!d) return '';
  d.setDate(d.getDate() - 1);
  return gregorianToJalaliStr(d);
}

/** تعداد روز باقی‌مانده تا یک تاریخ شمسی (منفی یعنی گذشته) */
function daysUntilJalali(str) {
  if (!str) return null;
  const target = jalaliStrToDate(str);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/* ==================== سایر ==================== */

/** تولید شناسه یکتا */
function generateId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/** محاسبه کارکرد ماهانه از روی کارکرد روزانه تقریبی */
function calcMonthlyFromDaily(daily) {
  const d = Number(daily);
  if (!d || isNaN(d)) return null;
  return Math.round(d * 30);
}

/** debounce ساده */
function debounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** خواندن فایل تصویر و تبدیل به dataURL فشرده‌شده */
function readImageAsDataURL(file, maxSize = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round(height * (maxSize / width)); width = maxSize; }
          else { width = Math.round(width * (maxSize / height)); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ==================== آیکن‌ها (بدون اموجی - سبک خطی مشابه آیکن‌های ولوو) ==================== */

/**
 * مجموعه آیکن‌های خطی SVG محلی، با سبک ساده و هندسی نزدیک به Volvo Design System.
 * همه به‌صورت mask با currentColor رندر می‌شوند تا با رنگ متن هماهنگ باشند و کاملاً آفلاین کار کنند.
 */
/**
 * نگاشت نام‌های داخلی (در صورت بازمانده از کد قدیمی) به نام دقیق آیکون‌های
 * Volvo Design System (kebab-case) — نام فایل باید دقیقاً با نام آیکون در
 * کتابخانه‌ی رسمی یکی باشد تا فایل SVG که خودتان دانلود می‌کنید مستقیماً کار کند.
 */
const ICON_ALIASES = {
  chevronDown: 'chevron-down',
  chevronLeft: 'chevron-back',
  chevronRight: 'chevron-forward',
  check: 'checkmark',
  search: 'search',
  info: 'info',
};

/**
 * آیکن با mask تا رنگ currentColor بگیرد.
 * نام باید دقیقاً برابر نام فایل SVG داخل assets/symbols/ باشد
 * (مطابق نام‌گذاری کتابخانه‌ی آیکون Volvo Design System، مثل chevron-down.svg، bell.svg، wrench.svg).
 * مسیر مask به‌صورت inline روی خود المان ست می‌شود تا نسبت به صفحه
 * (نه فایل css/) حل شود و دیگر 404 ندهد.
 */
function acIcon(name, extraClass = '') {
  const resolved = ICON_ALIASES[name] || name;
  const url = `assets/symbols/${resolved}.svg`;
  return `<span class="sf-icon${extraClass ? ' ' + extraClass : ''}" style="-webkit-mask-image:url('${url}');mask-image:url('${url}');" aria-hidden="true"></span>`;
}

/**
 * فرمت‌دهی زنده ورودی عددی هنگام تایپ: ارقام فارسی + جداکننده هزارگان.
 * روی رویداد input یک input element فراخوانی می‌شود و مقدار خام (ارقام انگلیسی بدون جداکننده)
 * را از طریق getValue قابل دسترسی می‌کند.
 * bindThousandsInput(el, onChange) -> onChange(rawDigitsString) هر بار که مقدار تغییر کند
 */
function bindThousandsInput(el, onChange) {
  const reformat = () => {
    const raw = toEnDigits(el.value).replace(/[^\d]/g, '');
    const formatted = raw ? formatNumberFa(raw) : '';
    el.value = formatted;
    if (onChange) onChange(raw);
  };
  el.addEventListener('input', reformat);
  return reformat;
}

/** escape متن برای درج امن در HTML */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export {
  toFaDigits, toEnDigits, formatNumberFa, formatToman, formatKm,
  gregorianToJalaliStr, todayJalaliStr, jalaliStrToDate, JALALI_MONTHS,
  jalaliMonthDays, isJalaliLeapYear, gregorianToJal, jalToGregorian,
  PLATE_LETTERS, formatPlate, isPlateComplete, isPlatePartial,
  generateId, calcMonthlyFromDaily, debounce, readImageAsDataURL, escapeHtml,
  acIcon, bindThousandsInput, addOneJalaliYear, addOneJalaliYearMinusOneDay, daysUntilJalali,
};
