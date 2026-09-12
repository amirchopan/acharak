/**
 * components.js
 * کامپوننت‌های رابط کاربری قابل استفاده مجدد، مطابق با اصول Volvo Design System
 */

import {
  toFaDigits, toEnDigits, formatToman, formatKm, todayJalaliStr,
  JALALI_MONTHS, jalaliMonthDays, PLATE_LETTERS, formatPlate, escapeHtml, acIcon,
  readImageAsDataURL,
} from './utils.js';

/* ==================== Toast ==================== */

let toastTimer = null;
function showToast(message, type = 'default') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast__icon sf">${type === 'success' ? acIcon('checkmark') : type === 'error' ? acIcon('close') : acIcon('info')}</span><span class="toast__text">${escapeHtml(message)}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ==================== Alert (Confirm) ==================== */

function showAlert({ title, message, confirmText = 'تایید', cancelText = 'انصراف', destructive = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="alert-box" role="alertdialog" aria-modal="true">
        <h3 class="alert-box__title">${escapeHtml(title)}</h3>
        ${message ? `<p class="alert-box__message">${escapeHtml(message)}</p>` : ''}
        <div class="alert-box__actions">
          <button type="button" class="alert-box__btn alert-box__btn--cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="alert-box__btn ${destructive ? 'alert-box__btn--destructive' : 'alert-box__btn--confirm'}">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    const close = (val) => {
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    };
    overlay.querySelector('.alert-box__btn--cancel').addEventListener('click', () => close(false));
    overlay.querySelector(`.alert-box__btn--${destructive ? 'destructive' : 'confirm'}`).addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

/* ==================== Sheet / Modal ==================== */

/**
 * نمایش یک Sheet (از پایین صفحه بالا می‌آید - مناسب موبایل) شامل محتوای دلخواه
 * options: { title, contentEl یا contentHTML, onClose }
 * برمی‌گرداند: { el, close }
 */
function openSheet({ title, contentHTML = '', contentEl = null, size = 'default', onClose = null }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay overlay--sheet';
  overlay.innerHTML = `
    <div class="sheet sheet--${size}" role="dialog" aria-modal="true">
      <div class="sheet__grabber"></div>
      <div class="sheet__header">
        <h2 class="sheet__title">${escapeHtml(title || '')}</h2>
        <button type="button" class="sheet__close" aria-label="بستن"><span class="sf">${acIcon('close')}</span></button>
      </div>
      <div class="sheet__body"></div>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector('.sheet__body');
  if (contentEl) body.appendChild(contentEl);
  else body.innerHTML = contentHTML;

  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const close = () => {
    overlay.classList.remove('is-visible');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 280);
    if (onClose) onClose();
  };
  overlay.querySelector('.sheet__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  return { el: overlay, body, close };
}

/* ==================== Segmented Control ==================== */

/**
 * options: string[] یا { label, value?, icon? }[]
 * selected: مقدار فعلی (label یا value)
 */
function createSegmentedControl(options, selected, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  const normalized = options.map((opt) => {
    if (typeof opt === 'string') return { label: opt, value: opt, icon: null };
    return { label: opt.label, value: opt.value != null ? opt.value : opt.label, icon: opt.icon || null };
  });
  normalized.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented__item' + (opt.value === selected || opt.label === selected ? ' is-active' : '');
    if (opt.icon) {
      btn.innerHTML = `<span class="segmented__icon sf">${acIcon(opt.icon)}</span><span>${escapeHtml(opt.label)}</span>`;
    } else {
      btn.textContent = opt.label;
    }
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.segmented__item').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      onChange(opt.value);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

/* ==================== ComboBox ساده ==================== */

/**
 * ساخت یک combobox با پاپ‌آپ لیست قابل جستجو
 * items: [{ value, label, meta }]
 */
function createCombobox({
  items,
  value = null,
  placeholder = "انتخاب کنید",
  onSelect,
  renderItem = null,
  searchable = true,
  autoFocus = false,
}) {
  const wrap = document.createElement("div");
  wrap.className = "combobox";
  const current = items.find((i) => i.value === value);
  wrap.innerHTML = `
    <button type="button" class="combobox__trigger">
      <span class="combobox__value">${
        current
          ? escapeHtml(current.label)
          : `<span class="combobox__placeholder">${escapeHtml(placeholder)}</span>`
      }</span>
      <span class="combobox__chevron sf">${acIcon("chevron-down")}</span>
    </button>`;
  const trigger = wrap.querySelector(".combobox__trigger");
  const valueEl = wrap.querySelector(".combobox__value");

  trigger.addEventListener("click", () => {
    const sheet = openSheet({ title: placeholder, size: "default" });
    const searchWrap = document.createElement("div");
    searchWrap.className = "combobox__search-wrap";
    if (searchable) {
      searchWrap.innerHTML = `<input type="text" class="text-input" placeholder="جستجو…" inputmode="search" />`;
    }
    const list = document.createElement("div");
    list.className = "combobox__list";

    const renderList = (filter = "") => {
      list.innerHTML = "";
      const f = filter.trim();
      items
        .filter((i) => !f || i.label.includes(f))
        .forEach((item) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "combobox__row" + (item.value === value ? " is-selected" : "");
          row.innerHTML = renderItem
            ? renderItem(item)
            : `<span>${escapeHtml(item.label)}</span>`;
          row.addEventListener("click", () => {
            value = item.value;
            valueEl.innerHTML = escapeHtml(item.label);
            onSelect(item);
            sheet.close();
          });
          list.appendChild(row);
        });
      if (!list.children.length) {
        list.innerHTML = '<p class="combobox__empty">موردی یافت نشد</p>';
      }
    };

    renderList();
    if (searchable) sheet.body.appendChild(searchWrap);
    sheet.body.appendChild(list);

    if (searchable) {
      const input = searchWrap.querySelector("input");
      input.addEventListener("input", () => renderList(input.value));
      if (autoFocus) setTimeout(() => input.focus(), 200);
    }
  });

  return wrap;
}

/* ==================== انتخابگر تاریخ جلالی ==================== */

/**
 * پیکر تاریخ شمسی حرفه‌ای - سه ستون روز/ماه/سال قابل اسکرول
 * onSelect(dateStr) با فرمت YYYY/MM/DD
 */
function openJalaliDatePicker({ value, onSelect }) {
  const initial = value ? toEnDigits(value).split('/').map(Number) : todayJalaliStr().split('/').map(Number);
  let jy = initial[0] || Number(todayJalaliStr().split('/')[0]);
  let jm = initial[1] || 1;
  let jd = initial[2] || 1;
  const currentYear = Number(todayJalaliStr().split('/')[0]);
  const years = [];
  for (let y = currentYear + 2; y >= currentYear - 100; y -= 1) years.push(y);

  const sheet = openSheet({ title: 'انتخاب تاریخ', size: 'default' });
  const wrap = document.createElement('div');
  wrap.className = 'datepicker';
  wrap.innerHTML = `
    <div class="datepicker__cols">
      <div class="datepicker__col" data-col="day"></div>
      <div class="datepicker__col" data-col="month"></div>
      <div class="datepicker__col" data-col="year"></div>
    </div>
    <button type="button" class="btn btn--primary btn--block datepicker__confirm">تایید تاریخ</button>
  `;
  sheet.body.appendChild(wrap);

  function buildCol(colName, values, formatFn, selectedVal, onPick, rebuildOnPick) {
    const col = wrap.querySelector(`[data-col="${colName}"]`);
    const prevScroll = col.scrollTop;
    col.innerHTML = values.map((v) => {
      const active = Number(v) === Number(selectedVal);
      return `<button type="button" class="datepicker__item${active ? ' is-active' : ''}" data-val="${v}">${formatFn(v)}</button>`;
    }).join('');
    col.querySelectorAll('.datepicker__item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = Number(btn.dataset.val);
        onPick(val);
        if (rebuildOnPick) {
          render();
        } else {
          col.querySelectorAll('.datepicker__item').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
        }
        requestAnimationFrame(() => {
          const active = col.querySelector('.is-active');
          if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      });
    });
    const active = col.querySelector('.is-active');
    if (active) {
      setTimeout(() => active.scrollIntoView({ block: 'center' }), 40);
    } else {
      col.scrollTop = prevScroll;
    }
  }

  function render() {
    const maxDay = jalaliMonthDays(jy, jm);
    if (jd > maxDay) jd = maxDay;
    if (jd < 1) jd = 1;
    if (jm < 1) jm = 1;
    if (jm > 12) jm = 12;
    const days = Array.from({ length: maxDay }, (_, i) => i + 1);
    buildCol('day', days, toFaDigits, jd, (v) => { jd = v; }, false);
    buildCol('month', Array.from({ length: 12 }, (_, i) => i + 1), (v) => JALALI_MONTHS[v - 1], jm, (v) => { jm = v; }, true);
    buildCol('year', years, toFaDigits, jy, (v) => { jy = v; }, true);
  }
  render();

  wrap.querySelector('.datepicker__confirm').addEventListener('click', () => {
    const str = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    onSelect(str);
    sheet.close();
  });
}

/* ==================== انتخابگر تصویر حرفه‌ای ==================== */

/**
 * ساخت یک باکس حرفه‌ای انتخاب تصویر با پیش‌نمایش و امکان حذف/لغو تصویر انتخابی
 * value: dataURL فعلی یا null | placeholderIcon: نام آیکن هنگام نبود تصویر
 * onChange(dataURL|null) هر بار که تصویر انتخاب یا حذف شود فراخوانی می‌شود
 */
function createPhotoPicker({ value = null, placeholderIcon = "photo", onChange }) {
  const inputId = "photo-box-input-" + Math.random().toString(36).slice(2, 9);
  const wrap = document.createElement("div");
  wrap.className = "photo-drop" + (value ? " has-image" : "");

  function render(dataUrl) {
    wrap.classList.remove("is-removing"); // همیشه پاک شود
    if (dataUrl) {
      wrap.classList.add("has-image");
      wrap.innerHTML = `
        <div class="photo-drop__preview">
          <img src="${dataUrl}" alt="" />
          <div class="photo-drop__actions">
            <label for="${inputId}" class="photo-drop__btn photo-drop__btn--edit" title="تغییر تصویر">
              <span class="sf">${acIcon("camera")}</span>
            </label>
            <button type="button" class="photo-drop__btn photo-drop__btn--remove" title="حذف تصویر">
              <span class="sf">${acIcon("trash")}</span>
            </button>
          </div>
        </div>
        <input type="file" accept="image/*" class="photo-drop__input" id="${inputId}" />
      `;
      wrap.querySelector(".photo-drop__btn--remove").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (wrap.classList.contains("is-removing")) return;
        wrap.classList.add("is-removing");
        setTimeout(() => {
          onChange(null);
          render(null);
        }, 280);
      });
    } else {
      wrap.classList.remove("has-image");
      wrap.innerHTML = `
        <label for="${inputId}" class="photo-drop__empty">
          <span class="photo-drop__icon sf">${acIcon("camera")}</span>
          <span class="photo-drop__title">کشیدن و رها کردن تصویر</span>
          <span class="photo-drop__or">یا</span>
          <span class="photo-drop__browse">انتخاب از گالری</span>
        </label>
        <input type="file" accept="image/*" class="photo-drop__input" id="${inputId}" />
      `;
    }

    const fileInput = wrap.querySelector(".photo-drop__input");
    fileInput.value = ""; // اجازه انتخاب دوباره همان فایل
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readImageAsDataURL(file, 800, 0.82);
        onChange(dataUrl);
        render(dataUrl);
      } catch (_) {
        showToast("خطا در بارگذاری تصویر", "error");
      }
    });
  }

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) => {
    wrap.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    wrap.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove("is-dragover");
    });
  });
  wrap.addEventListener("drop", async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await readImageAsDataURL(file, 800, 0.82);
      onChange(dataUrl);
      render(dataUrl);
    } catch (_) {
      showToast("خطا در بارگذاری تصویر", "error");
    }
  });

  render(value);
  return wrap;
}
/* ==================== ویجت پلاک ایرانی ==================== */

/**
 * گالری چند-عکسی با محدودیت تعداد (مثلا حداکثر ۳ عکس کارت معاینه فنی)
 * value: آرایه dataURL | onChange(newArray) هر بار که آرایه تغییر کند
 */
function createPhotoGallery({ value = [], max = 3, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "photo-gallery";
  let photos = Array.isArray(value) ? [...value] : [];

  function render() {
    wrap.innerHTML = "";
    photos.forEach((dataUrl, idx) => {
      const item = document.createElement("div");
      item.className = "photo-gallery__item";
      item.innerHTML = `
        <img src="${dataUrl}" alt="" />
        <button type="button" class="photo-gallery__remove" title="حذف تصویر">
          <span class="sf">${acIcon("close")}</span>
        </button>
      `;
      item.querySelector(".photo-gallery__remove").addEventListener("click", () => {
        photos.splice(idx, 1);
        onChange(photos);
        render();
      });
      wrap.appendChild(item);
    });
    if (photos.length < max) {
      const inputId = "photo-gallery-input-" + Math.random().toString(36).slice(2, 9);
      const addBtn = document.createElement("label");
      addBtn.className = "photo-gallery__add";
      addBtn.setAttribute("for", inputId);
      addBtn.innerHTML = `
        <span class="sf">${acIcon("camera")}</span>
        <span class="photo-gallery__add-text">افزودن عکس</span>
        <input type="file" accept="image/*" id="${inputId}" class="photo-gallery__input" />
      `;
      addBtn.querySelector("input").addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await readImageAsDataURL(file, 1000, 0.82);
          photos.push(dataUrl);
          onChange(photos);
          render();
        } catch (_) {
          showToast("خطا در بارگذاری تصویر", "error");
        }
      });
      wrap.appendChild(addBtn);
    }
    const countEl = document.createElement("p");
    countEl.className = "photo-gallery__count";
    countEl.textContent = `${toFaDigits(photos.length)} از ${toFaDigits(max)} عکس`;
    wrap.appendChild(countEl);
  }

  render();
  return wrap;
}

/* ==================== ویجت پلاک ایرانی ==================== */

/**
 * ساخت ویجت تصویری پلاک ایران
 * value: { part1 (2 رقم سمت راست), letter, part2 (3 رقم وسط), part3 (کد شهر - 2 رقم) }
 * onChange(plateObj)
 */
function createIranPlateWidget(value = {}, onChange) {
  const src = value && typeof value === "object" ? value : {};
  const state = {
    part1: src.part1 || "",
    letter: src.letter || "",
    part2: src.part2 || "",
    part3: src.part3 || "",
  };

  const wrap = document.createElement("div");
  wrap.className = "iran-plate-widget";

  function digitCells(group, count, current) {
    let html = "";
    for (let i = 0; i < count; i += 1) {
      const ch = current[i] ? toFaDigits(current[i]) : "";
      html += `<input type="tel" inputmode="numeric" maxlength="1"
        class="iran-plate__digit" data-group="${group}" data-index="${i}"
        value="${ch}" placeholder="_" aria-label="رقم ${i + 1}" />`;
    }
    return html;
  }

  wrap.innerHTML = `
    <div class="iran-plate" dir="ltr">
      <div class="iran-plate__blue">
        <div class="iran-plate__flag" aria-hidden="true">
          <span class="iran-plate__flag-stripe iran-plate__flag-stripe--g"></span>
          <span class="iran-plate__flag-stripe iran-plate__flag-stripe--w"></span>
          <span class="iran-plate__flag-stripe iran-plate__flag-stripe--r"></span>
        </div>
        <div class="iran-plate__ir-text">I.R.<br/>IRAN</div>
      </div>

      <div class="iran-plate__group iran-plate__group--part1">
        ${digitCells("part1", 2, state.part1)}
      </div>

      <button type="button" class="iran-plate__letter" aria-label="انتخاب حرف">
        ${state.letter ? escapeHtml(state.letter) : '<span class="iran-plate__letter-ph">ـ</span>'}
      </button>

      <div class="iran-plate__group iran-plate__group--part2">
        ${digitCells("part2", 3, state.part2)}
      </div>

      <div class="iran-plate__province">
        <span class="iran-plate__iran-label">ایــــران</span>
        <div class="iran-plate__group iran-plate__group--part3">
          ${digitCells("part3", 2, state.part3)}
        </div>
      </div>
    </div>
  `;

  function readGroup(group, len) {
    const inputs = [...wrap.querySelectorAll(`.iran-plate__digit[data-group="${group}"]`)];
    return inputs
      .map((el) => toEnDigits(el.value).replace(/[^\d]/g, "").slice(0, 1))
      .join("")
      .slice(0, len);
  }

  function emit() {
    state.part1 = readGroup("part1", 2);
    state.part2 = readGroup("part2", 3);
    state.part3 = readGroup("part3", 2);
    onChange({ ...state });
  }

  function focusDigit(group, index) {
    const el = wrap.querySelector(
      `.iran-plate__digit[data-group="${group}"][data-index="${index}"]`,
    );
    if (el) el.focus();
  }

  function openLetterPicker() {
    const sheet = openSheet({ title: "انتخاب حرف پلاک", size: "default" });
    const grid = document.createElement("div");
    grid.className = "plate-letter-grid";
    PLATE_LETTERS.forEach((letter) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "plate-letter-grid__item" + (state.letter === letter ? " is-active" : "");
      b.textContent = letter;
      b.addEventListener("click", () => {
        state.letter = letter;
        const btn = wrap.querySelector(".iran-plate__letter");
        btn.innerHTML = escapeHtml(letter);
        onChange({ ...state });
        sheet.close();
        // بعد از حرف → اولین رقم بخش ۳تایی
        setTimeout(() => focusDigit("part2", 0), 180);
      });
      grid.appendChild(b);
    });
    sheet.body.appendChild(grid);
  }

  wrap.querySelector(".iran-plate__letter").addEventListener("click", openLetterPicker);

  // ترتیب فوکوس خودکار
  const sequence = [
    { group: "part1", index: 0 },
    { group: "part1", index: 1 },
    { group: "letter" },
    { group: "part2", index: 0 },
    { group: "part2", index: 1 },
    { group: "part2", index: 2 },
    { group: "part3", index: 0 },
    { group: "part3", index: 1 },
  ];

  function nextAfter(group, index) {
    const i = sequence.findIndex(
      (s) => s.group === group && s.index === index,
    );
    if (i < 0) return;
    const n = sequence[i + 1];
    if (!n) return;
    if (n.group === "letter") openLetterPicker();
    else focusDigit(n.group, n.index);
  }

  function prevBefore(group, index) {
    const i = sequence.findIndex(
      (s) => s.group === group && s.index === index,
    );
    if (i <= 0) return;
    const p = sequence[i - 1];
    if (p.group === "letter") {
      wrap.querySelector(".iran-plate__letter").focus();
    } else {
      focusDigit(p.group, p.index);
    }
  }

  wrap.querySelectorAll(".iran-plate__digit").forEach((el) => {
    el.addEventListener("input", () => {
      const group = el.dataset.group;
      const index = Number(el.dataset.index);
      const raw = toEnDigits(el.value).replace(/[^\d]/g, "").slice(-1);
      el.value = raw ? toFaDigits(raw) : "";
      emit();
      if (raw) nextAfter(group, index);
    });

    el.addEventListener("keydown", (e) => {
      const group = el.dataset.group;
      const index = Number(el.dataset.index);
      if (e.key === "Backspace" && !el.value) {
        e.preventDefault();
        prevBefore(group, index);
      }
    });

    // فقط رقم
    el.addEventListener("beforeinput", (e) => {
      if (e.data && /[^\d۰-۹٠-٩]/.test(e.data)) e.preventDefault();
    });
  });

  wrap.getState = () => ({ ...state });
  return wrap;
}

/** نمایش فقط‌خواندنی پلاک — بدون نوار آبی، بدون بک‌گراند */
function createIranPlateDisplay(plate) {
  const el = document.createElement("div");
  el.className = "iran-plate-widget iran-plate-widget--display";

  const p1 = plate?.part1 || "";
  const letter = plate?.letter || "";
  const p2 = plate?.part2 || "";
  const p3 = plate?.part3 || "";
  const hasAny = p1 || letter || p2 || p3;

  if (!hasAny) {
    el.innerHTML = `<p class="iran-plate-display__empty">بدون پلاک</p>`;
    return el;
  }

  const cells = (str, len) => {
    let h = "";
    for (let i = 0; i < len; i += 1) {
      const ch = str[i] ? toFaDigits(str[i]) : "·";
      h += `<span class="plate-view__d">${ch}</span>`;
    }
    return h;
  };

  el.innerHTML = `
    <div class="plate-view" dir="ltr" aria-hidden="true">
      <span class="plate-view__group">${cells(p1, 2)}</span>
      <span class="plate-view__letter">${letter ? escapeHtml(letter) : "ـ"}</span>
      <span class="plate-view__group">${cells(p2, 3)}</span>
      <span class="plate-view__sep"></span>
      <span class="plate-view__prov">
        <span class="plate-view__group plate-view__group--prov">${cells(p3, 2)}</span>
      </span>
    </div>
  `;
  return el;
}
/* ==================== کارت خودرو ==================== */

function createCarCard(car, onClick) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card car-card" + (car.photo ? " car-card--photo" : "");

  const subtitle = car.otherSpecTitle
    ? escapeHtml(car.otherSpecTitle)
    : car.model
      ? escapeHtml(car.model)
      : "";
  const colorName =
    car.color && car.color.name ? escapeHtml(car.color.name) : "";

  const photoUrl = car.photo ? car.photo.replace(/'/g, "\\'") : "";
  const fadeSolid = "25%";
  const fadeEnd = "100%";

  card.innerHTML = `
    ${
      car.photo
        ? `
      <div class="car-card__photo-bg"
           style="background-image:url('${photoUrl}');--car-fade-solid:${fadeSolid};--car-fade-end:${fadeEnd}"></div>
      <div class="car-card__photo-scrim" aria-hidden="true"></div>
    `
        : ""
    }
    <div class="car-card__content">
      <div class="car-card__title-row">
        <h3 class="car-card__name">${escapeHtml(car.brandModel || "بدون نام")}</h3>
      </div>
      ${subtitle ? `<p class="car-card__subtitle">${subtitle}</p>` : ""}
      <div class="car-card__meta">
        ${colorName ? `<span class="car-card__color">${colorName}</span>` : ""}
        <div class="car-card__plate-mount"></div>
      </div>
    </div>
  `;

  card.querySelector(".car-card__plate-mount").appendChild(
    createIranPlateDisplay(car.plate),
  );
  card.addEventListener("click", onClick);
  return card;
}

/* ==================== کارت سرویس ==================== */

function createServiceCard(service, car, onPreview, onClick) {
  const card = document.createElement('div');
  card.className = 'card service-card';
  const items = service.serviceItems || [];
  const hasOilChange = !!(service.oilChange && service.oilChange.done);
  const oilPill = hasOilChange
    ? `<span class="pill pill--oil"><span class="sf pill--oil__icon">${acIcon("engine-oil")}</span>تعویض روغن</span>`
    : "";
  const pills = items
    .slice(0, hasOilChange ? 3 : 4)
    .map((i) => `<span class="pill">${escapeHtml(i.title)}</span>`)
    .join("");
  const moreCount = items.length > (hasOilChange ? 3 : 4)
    ? items.length - (hasOilChange ? 3 : 4)
    : 0;
  card.innerHTML = `
    <button type="button" class="service-card__main">
      <div class="service-card__row">
        <h3 class="service-card__car">${escapeHtml(car ? car.brandModel : 'خودرو حذف‌شده')}</h3>
        <span class="service-card__date">${toFaDigits(service.date || '')}</span>
      </div>
      <div class="service-card__row service-card__row--meta">
        <span class="service-card__km sf-inline">${formatKm(service.km)}</span>
        <span class="service-card__cost">${formatToman(service.totalCost)}</span>
      </div>
      <div class="service-card__pills">${oilPill}${pills}${moreCount ? `<span class="pill pill--muted">+${toFaDigits(moreCount)}</span>` : ""}</div>    </button>
    <button type="button" class="service-card__preview-btn">پیش‌نمایش خدمات</button>
  `;
  card.querySelector('.service-card__main').addEventListener('click', onClick);
  card.querySelector('.service-card__preview-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onPreview(service, car);
  });
  return card;
}

/** نمایش فاکتور بانکی ساده از خدمات یک سرویس */
/** ساخت تصویر PNG از داده‌های صورتحساب (بدون وابستگی خارجی) */
function isAppDarkTheme() {
  const root = document.documentElement;
  if (root.classList.contains("theme-dark")) return true;
  if (root.classList.contains("theme-light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

async function ensureReceiptFont() {
  const family = "Vazirmatn";
  try {
    // فقط وزن‌هایی که در @font-face تعریف شده‌اند
    await Promise.all([
      document.fonts.load(`400 14px "${family}"`),
      document.fonts.load(`600 14px "${family}"`),
      document.fonts.load(`700 18px "${family}"`),
    ]);
    await document.fonts.ready;
  } catch (_) {}
  return family;
}

async function buildReceiptPngBlob(service, car, rows) {
  const fontFamily = await ensureReceiptFont();
  const dark = isAppDarkTheme();

  // در تم شب رنگ muted را قوی‌تر بگیر تا دیده شود
  const colors = dark
    ? {
        bg: "#171717",
        title: "#FFFFFF",
        muted: "#969696",
        line: "rgba(255, 255, 255, 0.16)",
        text: "#FFFFFF",
        footer: "#787878",
      }
    : {
        bg: "#FFFFFF",
        title: "#000000",
        muted: "#5e5e5e",
        line: "rgba(0, 0, 0, 0.12)",
        text: "#000000",
        footer: "#787878",
      };

  const scale = 2;
  const width = 380;
  const pad = 28;
  const rowGap = 16;
  const headerH = 64;
  const rowsH = Math.max(rows.length, 1) * (40 + rowGap);
  const footerH = 72; // جا برای جمع کل + نام برنامه
  const height = pad * 2 + headerH + 16 + rowsH + 20 + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // مهم برای رندر فارسی روی بعضی موتورهای موبایل
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  const right = width - pad;
  const left = pad;
  let y = pad;

  // عنوان — Bold
  ctx.fillStyle = colors.title;
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.font = `700 18px "${fontFamily}", Tahoma, sans-serif`;
  ctx.fillText(car ? car.brandModel : "صورتحساب سرویس", width / 2, y + 22);

  // تاریخ و کیلومتر — Regular (نه 500)
  ctx.fillStyle = colors.muted;
  ctx.font = `400 13px "${fontFamily}", Tahoma, sans-serif`;
  ctx.fillText(
    `${toFaDigits(service.date || "")}  ·  ${formatKm(service.km)}`,
    width / 2,
    y + 46,
  );
  y += headerH;

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 18;

  if (!rows.length) {
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    ctx.font = `400 14px "${fontFamily}", Tahoma, sans-serif`;
    ctx.fillText("خدمتی ثبت نشده است", width / 2, y + 20);
    y += 40;
  } else {
    rows.forEach(([title, sub, cost]) => {
      // عنوان خدمت
      ctx.textAlign = "right";
      ctx.fillStyle = colors.text;
      ctx.font = `600 14px "${fontFamily}", Tahoma, sans-serif`;
      ctx.fillText(String(title || ""), right, y + 14);

      // وضعیت / زیرعنوان — Regular
      ctx.fillStyle = colors.muted;
      ctx.font = `400 12px "${fontFamily}", Tahoma, sans-serif`;
      ctx.fillText(String(sub || "—"), right, y + 32);

      // هزینه
      ctx.textAlign = "left";
      ctx.fillStyle = colors.text;
      ctx.font = `600 13px "${fontFamily}", Tahoma, sans-serif`;
      ctx.fillText(cost ? formatToman(cost) : "—", left, y + 22);
      y += 40 + rowGap;
    });
  }

  y += 4;
  ctx.strokeStyle = colors.line;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 24;

  // جمع کل
  ctx.textAlign = "right";
  ctx.fillStyle = colors.title;
  ctx.font = `700 16px "${fontFamily}", Tahoma, sans-serif`;
  ctx.fillText("جمع کل هزینه‌ها", right, y + 8);
  ctx.textAlign = "left";
  ctx.fillText(formatToman(service.totalCost), left, y + 8);

  // فوتر فقط روی تصویر — نام برنامه
  ctx.textAlign = "center";
  ctx.fillStyle = colors.footer;
  ctx.font = `400 11px "${fontFamily}", Tahoma, sans-serif`;
  ctx.fillText("· آچارک ·", width / 2, height - 18);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("blob"))),
      "image/png",
    );
  });
}

async function saveReceiptImage(service, car, rows) {
  try {
    const blob = await buildReceiptPngBlob(service, car, rows);
    const stamp = (service.date || '').replace(/\//g, '-') || Date.now();
    const filename = `receipt-${stamp}.png`;
    const url = URL.createObjectURL(blob);

    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'صورتحساب سرویس' });
      URL.revokeObjectURL(url);
      showToast('تصویر صورتحساب ذخیره شد', 'success');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('تصویر صورتحساب ذخیره شد', 'success');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showToast('خطا در ذخیره تصویر', 'error');
  }
}

/** نمایش فاکتور بانکی ساده از خدمات یک سرویس */
function openServiceReceipt(service, car) {
  const rows = [];
  if (service.oilChange && service.oilChange.done) {
    const oilLabel = service.oilChange.oilName || '—';
    const oilGrade = service.oilChange.grade ? ` · ${service.oilChange.grade}` : '';
    rows.push(['تعویض روغن', `${oilLabel}${oilGrade}`, service.oilChange.cost]);
  }
  (service.goods || []).forEach((g) => {
    if (g.type === 'item') rows.push([g.title, `${toFaDigits(g.qty)} × ${formatToman(g.unitPrice)}`, g.amount]);
    else rows.push([g.title, '—', g.amount]);
  });
    (service.serviceItems || []).forEach((i) => {
    const sub = [i.status, i.note].filter(Boolean).join(" · ") || "—";
    rows.push([i.title, sub, i.cost]);
  });
  if (service.generalCost) rows.push(['هزینه کلی سرویس', '—', service.generalCost]);

  const sheet = openSheet({ title: 'صورتحساب سرویس', size: 'default' });
  const header = sheet.el.querySelector('.sheet__header');
  const closeBtn = header.querySelector('.sheet__close');
  const actions = document.createElement('div');
  actions.className = 'sheet__actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'receipt__save-btn receipt__save-btn--sheet';
  saveBtn.setAttribute('aria-label', 'ذخیره تصویر صورتحساب');
  saveBtn.innerHTML = `<span class="sf">${acIcon('download-cloud')}</span>`;
  saveBtn.addEventListener('click', () => {
    saveReceiptImage(service, car, rows);
  });
  actions.appendChild(saveBtn);
  header.insertBefore(actions, closeBtn);

  const receipt = document.createElement('div');
  receipt.className = 'receipt';
  receipt.innerHTML = `
    <div class="receipt__header">
      <p class="receipt__car">${escapeHtml(car ? car.brandModel : '')}</p>
      <p class="receipt__meta">${toFaDigits(service.date || '')} · ${formatKm(service.km)}</p>
    </div>
    <div class="receipt__divider"></div>
    <div class="receipt__rows">
      ${rows.map(([title, sub, cost]) => `
        <div class="receipt__row">
          <div class="receipt__row-text">
            <span class="receipt__row-title">${escapeHtml(title)}</span>
            <span class="receipt__row-sub">${escapeHtml(String(sub))}</span>
          </div>
          <span class="receipt__row-cost">${cost ? formatToman(cost) : '—'}</span>
        </div>`).join('')}
      ${!rows.length ? '<p class="receipt__empty">خدمتی ثبت نشده است</p>' : ''}
    </div>
    <div class="receipt__divider receipt__divider--dashed"></div>
    <div class="receipt__total">
      <span>جمع کل</span>
      <span>${formatToman(service.totalCost)}</span>
    </div>
  `;
  sheet.body.appendChild(receipt);
}

function openInsuranceReceipt(car) {
  const insurance = car.insurance || {};
  const payments = Object.entries(insurance.payments || {})
    .filter(([, payment]) => payment && (payment.amount || payment.date || payment.paid))
    .map(([key, payment]) => [
      key === "cash" ? "نقد" : `قسط ${toFaDigits(key.replace("inst", ""))}`,
      payment.paid ? "پرداخت شده" : payment.date ? `سررسید ${toFaDigits(payment.date)}` : "پرداخت نشده",
      payment.amount,
    ]);
  const total = payments.reduce((sum, [, , amount]) => sum + (Number(amount) || 0), 0);
  const service = { date: insurance.fromDate || "", km: "", totalCost: total };
  const sheet = openSheet({ title: "وضعیت اقساط بیمه", size: "default" });
  const header = sheet.el.querySelector(".sheet__header");
  const closeBtn = header.querySelector(".sheet__close");
  const actions = document.createElement("div");
  actions.className = "sheet__actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "receipt__save-btn receipt__save-btn--sheet";
  saveBtn.setAttribute("aria-label", "ذخیره تصویر صورتحساب");
  saveBtn.innerHTML = `<span class="sf">${acIcon("download-cloud")}</span>`;
  saveBtn.addEventListener("click", () => saveReceiptImage(service, car, payments));
  actions.appendChild(saveBtn);
  header.insertBefore(actions, closeBtn);

  const receipt = document.createElement("div");
  receipt.className = "receipt";
  receipt.innerHTML = `
    <div class="receipt__header">
      <p class="receipt__car">${escapeHtml(car.brandModel || "خودرو")} · بیمه‌نامه</p>
      <p class="receipt__meta">${insurance.toDate ? `اعتبار تا ${toFaDigits(insurance.toDate)}` : "تاریخ اعتبار ثبت نشده"}</p>
    </div>
    <div class="receipt__divider"></div>
    <div class="receipt__rows">
      ${payments.map(([title, sub, cost]) => `<div class="receipt__row"><div class="receipt__row-text"><span class="receipt__row-title">${escapeHtml(title)}</span><span class="receipt__row-sub">${escapeHtml(sub)}</span></div><span class="receipt__row-cost">${cost ? formatToman(cost) : "—"}</span></div>`).join("")}
      ${!payments.length ? '<p class="receipt__empty">قسطی ثبت نشده است</p>' : ""}
    </div>
    <div class="receipt__divider receipt__divider--dashed"></div>
    <div class="receipt__total"><span>جمع مبالغ</span><span>${formatToman(total)}</span></div>
  `;
  sheet.body.appendChild(receipt);
}

/* ==================== نوار پیمایش پایین (Tab Bar) ==================== */

function renderTabBar(activeRoute) {
  const tabs = [
    { route: '#/dashboard', label: 'داشبورد', icon: 'home' },
    { route: '#/services', label: 'سرویس‌ها', icon: 'wrench' },
    { route: '#/cars', label: 'خودروها', icon: 'car-front' },
    { route: '#/settings', label: 'تنظیمات', icon: 'settings' },
  ];
  let el = document.getElementById('tab-bar');
  if (!el) {
    el = document.createElement('nav');
    el.id = 'tab-bar';
    el.className = 'tab-bar';
    document.body.appendChild(el);
  }
  el.innerHTML = tabs.map((t) => `
    <a href="${t.route}" class="tab-bar__item${activeRoute === t.route ? ' is-active' : ''}">
      <span class="tab-bar__icon sf">${acIcon(t.icon)}</span>
      <span class="tab-bar__label">${t.label}</span>
    </a>`).join('');
}

/** دکمه شناور (FAB) */
function renderFab(label, onClick) {
  let fab = document.getElementById('fab');
  if (fab) fab.remove();
  fab = document.createElement('button');
  fab.id = 'fab';
  fab.type = 'button';
  fab.className = 'fab';
  fab.innerHTML = `<span class="fab__icon sf">${acIcon('plus')}</span><span class="fab__label">${escapeHtml(label)}</span>`;
  fab.addEventListener('click', onClick);
  document.body.appendChild(fab);
  return fab;
}

function removeFab() {
  const fab = document.getElementById('fab');
  if (fab) fab.remove();
}

export {
  showToast, showAlert, openSheet, createSegmentedControl, createCombobox,
  openJalaliDatePicker, createIranPlateWidget, createIranPlateDisplay, createCarCard, createServiceCard,
  openServiceReceipt, openInsuranceReceipt, renderTabBar, renderFab, removeFab, createPhotoPicker, createPhotoGallery,
};
