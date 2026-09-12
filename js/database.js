/**
 * database.js
 * لایه دسترسی به IndexedDB. تمام تعامل با پایگاه داده از این ماژول عبور می‌کند.
 */

const DB_NAME = 'car-service-manager-db';
const DB_VERSION = 2;

const STORES = {
  CARS: 'cars',
  SERVICES: 'services',
  REMINDERS: 'reminders',
  CATALOG: 'catalog',
  MAINTENANCE: 'maintenance',
  SETTINGS: 'settings',
};

let dbPromise = null;

/** پیش‌فرض فهرست خدمات سرویس (قابل ویرایش توسط کاربر بعدا) */
const DEFAULT_CATALOG = [
  // ═══════════════════════════════════════════
  // 🔴 اولویت ۱: سرویس‌های دوره‌ای پرکاربرد (روتین)
  // ═══════════════════════════════════════════
  { id: 'oil-filter', title: 'فیلتر روغن', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'air-filter', title: 'فیلتر هوا', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'cabin-filter', title: 'فیلتر کابین', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'fuel-filter', title: 'صافی/فیلتر بنزین', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'tire-pressure', title: 'تنظیم باد', statuses: ['نیتروژن', 'باد معمولی'] },
  { id: 'washer-fluid', title: 'مایع شیشه‌شو', statuses: ['بازدید شد', 'اضافه شد'] },
  { id: 'wiper-blade', title: 'تیغه برف پاک‌کن', statuses: ['تعویض شد'] },

  // ═══════════════════════════════════════════
  // 🟠 اولویت ۲: مایعات و روغن‌های خودرو
  // ═══════════════════════════════════════════
  { id: 'brake-oil', title: 'روغن ترمز', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'gearbox-oil', title: 'روغن گیربکس', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'power-steering-oil', title: 'روغن هیدرولیک فرمان', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'differential-oil', title: 'روغن دیفرانسیل', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'radiator-water', title: 'آب رادیاتور', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'antifreeze', title: 'ضد یخ', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'oil-additive', title: 'مکمل روغن', statuses: ['اضافه شد'] },
  { id: 'octane-booster', title: 'اکتان بنزین/مکمل سوخت', statuses: ['اضافه شد'] },

  // ═══════════════════════════════════════════
  // 🟡 اولویت ۳: سیستم ترمز
  // ═══════════════════════════════════════════
  { id: 'brake-pads', title: 'لنت ترمز', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'front-brake-pads', title: 'لنت ترمز جلو', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'rear-brake-pads', title: 'لنت ترمز عقب', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'front-disc-pads', title: 'لنت دیسکی جلو', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'rear-disc-pads', title: 'لنت دیسکی عقب', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'drum-brake-pads', title: 'لنت کاسه‌ای', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'brake-disc', title: 'دیسک چرخ/ترمز', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'brake-wire', title: 'سیم ترمز', statuses: ['بازدید شد', 'تعویض شد'] },

  // ═══════════════════════════════════════════
  // 🟢 اولویت ۴: سیستم برق و جرقه
  // ═══════════════════════════════════════════
  { id: 'battery', title: 'باتری', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'spark-plugs', title: 'شمع‌ها', statuses: ['شستشو', 'بازدید', 'تعویض'] },
  { id: 'spark-wires', title: 'وایر شمع‌ها', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'coil', title: 'کویل', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'starter', title: 'استارت', statuses: ['تعویض شد', 'تعمیر شد'] },
  { id: 'diag', title: 'دیاگ', statuses: ['انجام شد'] },

  // ═══════════════════════════════════════════
  // 🔵 اولویت ۵: تسمه‌ها و پمپ‌ها
  // ═══════════════════════════════════════════
  { id: 'timing-belt', title: 'تسمه تایم', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'alternator-belt', title: 'تسمه دینام', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'ac-belt', title: 'تسمه کولر', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'water-pump', title: 'واتر پمپ', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'oil-pump', title: 'پمپ روغن', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'fuel-pump', title: 'پمپ بنزین', statuses: ['بازدید شد', 'تعویض شد'] },

  // ═══════════════════════════════════════════
  // 🟣 اولویت ۶: موتور و سنسورها
  // ═══════════════════════════════════════════
  { id: 'engine-tune', title: 'تنظیم موتور', statuses: ['انجام شد'] },
  { id: 'engine-tuning', title: 'آچارکشی موتور', statuses: ['انجام شد'] },
  { id: 'engine-wash', title: 'شستشوی موتور', statuses: ['انجام شد'] },
  { id: 'engine-lubrication', title: 'روشویی موتور', statuses: ['انجام شد'] },
  { id: 'engine-mount', title: 'دسته موتور', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'thermostat', title: 'ترموستات', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'injector', title: 'انژکتور', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'idle-stepper', title: 'استپر موتور', statuses: ['شستشو', 'بازدید', 'تعویض'] },
  { id: 'oxygen-sensor', title: 'سنسور اکسیژن', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'gas-wire', title: 'سیم گاز', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'head-gasket', title: 'واشر سرسیلندر', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'radiator', title: 'رادیاتور', statuses: ['تعویض شد', 'بازدید شد', 'اضافه شد'] },
  { id: 'catalytic-converter', title: 'مبدل کاتالیستی', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'diesel-filter', title: 'فیلتر گازوئیل', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'gauge-check', title: 'فیلرگیری', statuses: ['انجام شد'] },

  // ═══════════════════════════════════════════
  // ⚪ اولویت ۷: کلاچ و انتقال قدرت
  // ═══════════════════════════════════════════
  { id: 'clutch-disc', title: 'دیسک و صفحه کلاچ', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'clutch-cable', title: 'سیم کلاچ', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'gearbox-filter', title: 'فیلتر گیربکس', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'polos', title: 'پولوس', statuses: ['بازدید شد', 'تعویض شد'] },
  { id: 'dust-boot', title: 'گردگیر پلوس', statuses: ['بازدید شد', 'تعویض شد'] },

  // ═══════════════════════════════════════════
  // 🔷 اولویت ۸: چرخ، لاستیک و جلوبندی
  // ═══════════════════════════════════════════
  { id: 'wheel-balance', title: 'بالانس چرخ‌ها', statuses: ['انجام شد'] },
  { id: 'wheel-alignment', title: 'تنظیم دهانه چرخ', statuses: ['انجام شد'] },
  { id: 'tire-rotation', title: 'جابجایی لاستیک‌ها', statuses: ['انجام شد'] },
  { id: 'tire-change', title: 'تعویض تایر', statuses: ['4 حلقه', '2 حلقه'] },
  { id: 'suspension-tightening', title: 'آچارکشی جلوبندی', statuses: ['انجام شد'] },
  { id: 'suspension-repair', title: 'تعمیر جلوبندی', statuses: ['انجام شد'] },

  // ═══════════════════════════════════════════
  // 🔶 اولویت ۹: خدمات تکمیلی
  // ═══════════════════════════════════════════
  { id: 'ac-gas', title: 'گاز کولر', statuses: ['بازدید شد', 'شارژ شد'] },
  { id: 'greasing', title: 'گریس کاری', statuses: ['انجام شد'] },
];

/**
 * فهرست قطعات نگهداری خودرو با عمر مفید پیش‌فرض (کیلومتر)
 * جدا از کاتالوگ خدمات سرویس — قابل توسعه و تغییر
 */
const DEFAULT_PARTS = [
  // روغن و فیلترها
  { id: 'engine-oil', title: 'روغن موتور', defaultLifeKm: 5000 },
  { id: 'oil-filter', title: 'فیلتر روغن', defaultLifeKm: 5000 },
  { id: 'air-filter', title: 'فیلتر هوا', defaultLifeKm: 10000 },
  { id: 'cabin-filter', title: 'فیلتر کابین', defaultLifeKm: 10000 },
  { id: 'fuel-filter', title: 'فیلتر بنزین', defaultLifeKm: 20000 },

  // سیستم ترمز
  { id: 'front-brake-pads', title: 'لنت ترمز جلو', defaultLifeKm: 30000 },
  { id: 'rear-brake-pads', title: 'لنت ترمز عقب', defaultLifeKm: 50000 },
  { id: 'brake-disc', title: 'دیسک ترمز', defaultLifeKm: 100000 },
  { id: 'brake-oil', title: 'روغن ترمز', defaultLifeKm: 40000 },

  // انتقال قدرت
  { id: 'clutch-disc', title: 'دیسک و صفحه کلاچ', defaultLifeKm: 80000 },
  { id: 'gearbox-oil', title: 'روغن گیربکس', defaultLifeKm: 60000 },
  { id: 'differential-oil', title: 'روغن دیفرانسیل', defaultLifeKm: 60000 },

  // فرمان
  { id: 'power-steering-oil', title: 'روغن هیدرولیک فرمان', defaultLifeKm: 50000 },

  // سیستم خنک‌کننده
  { id: 'antifreeze', title: 'ضد یخ / مایع خنک‌کننده', defaultLifeKm: 40000 },
  { id: 'thermostat', title: 'ترموستات', defaultLifeKm: 100000 },

  // تسمه‌ها
  { id: 'timing-belt', title: 'تسمه تایم', defaultLifeKm: 70000 },
  { id: 'alternator-belt', title: 'تسمه دینام', defaultLifeKm: 80000 },
  { id: 'ac-belt', title: 'تسمه کولر', defaultLifeKm: 80000 },

  // احتراق
  { id: 'spark-plugs', title: 'شمع‌ها', defaultLifeKm: 20000 },
  { id: 'spark-wires', title: 'وایر شمع‌ها', defaultLifeKm: 50000 },

  // برق
  { id: 'battery', title: 'باتری', defaultLifeKm: 60000 },

  // قطعات اضافه شده
  { id: 'oxygen-sensor', title: 'سنسور اکسیژن', defaultLifeKm: 50000 },
  { id: 'coolant-hoses', title: 'شلنگ‌های رادیاتور', defaultLifeKm: 80000 },
  { id: 'wiper-blades', title: 'تیغه برف‌پاک‌کن', defaultLifeKm: 20000 },
  { id: 'tires', title: 'لاستیک‌ها', defaultLifeKm: 50000 }
];

/** فهرست پیش‌فرض عناوین یادآوری */
const REMINDER_TITLES = [
  'تعویض تسمه تایم', 'تعویض روغن موتور', 'تعویض روغن گیربکس',
  'تعویض ضدیخ', 'تعویض لنت ترمز', 'سرویس دوره‌ای خودرو',
];

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.CARS)) {
        db.createObjectStore(STORES.CARS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SERVICES)) {
        const s = db.createObjectStore(STORES.SERVICES, { keyPath: 'id' });
        s.createIndex('carId', 'carId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.REMINDERS)) {
        const r = db.createObjectStore(STORES.REMINDERS, { keyPath: 'id' });
        r.createIndex('carId', 'carId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CATALOG)) {
        db.createObjectStore(STORES.CATALOG, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.MAINTENANCE)) {
        const m = db.createObjectStore(STORES.MAINTENANCE, { keyPath: 'id' });
        m.createIndex('carId', 'carId', { unique: false });
        m.createIndex('partId', 'partId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** مقداردهی اولیه: اگر کاتالوگ خالی است، پیش‌فرض را درج کن */
async function ensureCatalogSeeded() {
  const db = await openDB();
  const t = db.transaction(STORES.CATALOG, 'readonly');
  const store = t.objectStore(STORES.CATALOG);
  const count = await reqToPromise(store.count());
  if (count === 0) {
    await tx(STORES.CATALOG, 'readwrite', (s) => {
      DEFAULT_CATALOG.forEach((item) => s.put(item));
    });
  }
}

/* ================= عملیات عمومی CRUD ================= */

async function getAll(storeName) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readonly');
  return reqToPromise(t.objectStore(storeName).getAll());
}

async function getById(storeName, id) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readonly');
  return reqToPromise(t.objectStore(storeName).get(id));
}

async function put(storeName, item) {
  return tx(storeName, 'readwrite', (s) => s.put(item));
}

async function remove(storeName, id) {
  return tx(storeName, 'readwrite', (s) => s.delete(id));
}

async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readonly');
  const idx = t.objectStore(storeName).index(indexName);
  return reqToPromise(idx.getAll(value));
}

/* ================= خودرو ================= */

const CarsAPI = {
  getAll: () => getAll(STORES.CARS),
  getById: (id) => getById(STORES.CARS, id),
  save: (car) => put(STORES.CARS, car),
  delete: async (id) => {
    await remove(STORES.CARS, id);
    const services = await getByIndex(STORES.SERVICES, 'carId', id);
    await Promise.all(services.map((s) => remove(STORES.SERVICES, s.id)));
    const reminders = await getByIndex(STORES.REMINDERS, 'carId', id);
    await Promise.all(reminders.map((r) => remove(STORES.REMINDERS, r.id)));
    const maintenance = await getByIndex(STORES.MAINTENANCE, 'carId', id);
    await Promise.all(maintenance.map((m) => remove(STORES.MAINTENANCE, m.id)));
  },
};

/* ================= سرویس ================= */

const ServicesAPI = {
  getAll: () => getAll(STORES.SERVICES),
  getById: (id) => getById(STORES.SERVICES, id),
  getByCarId: (carId) => getByIndex(STORES.SERVICES, 'carId', carId),
  save: (service) => put(STORES.SERVICES, service),
  delete: (id) => remove(STORES.SERVICES, id),
};

/* ================= یادآور ================= */

const RemindersAPI = {
  getAll: () => getAll(STORES.REMINDERS),
  getById: (id) => getById(STORES.REMINDERS, id),
  getByCarId: (carId) => getByIndex(STORES.REMINDERS, 'carId', carId),
  save: (reminder) => put(STORES.REMINDERS, reminder),
  delete: (id) => remove(STORES.REMINDERS, id),
};

/* ================= نگهداری قطعات ================= */

const MaintenanceAPI = {
  getAll: () => getAll(STORES.MAINTENANCE),
  getById: (id) => getById(STORES.MAINTENANCE, id),
  getByCarId: (carId) => getByIndex(STORES.MAINTENANCE, 'carId', carId),
  save: (item) => put(STORES.MAINTENANCE, item),
  delete: (id) => remove(STORES.MAINTENANCE, id),
  /** آخرین رکورد هر partId برای یک خودرو */
  getLatestByCarId: async (carId) => {
    const all = await getByIndex(STORES.MAINTENANCE, 'carId', carId);
    const byPart = {};
    all.forEach((m) => {
      const prev = byPart[m.partId];
      if (!prev) {
        byPart[m.partId] = m;
        return;
      }
      const prevKm = Number(prev.replacedKm) || 0;
      const curKm = Number(m.replacedKm) || 0;
      if (curKm > prevKm) {
        byPart[m.partId] = m;
        return;
      }
      if (curKm === prevKm) {
        const prevDate = prev.replacedDate || '';
        const curDate = m.replacedDate || '';
        if (curDate > prevDate) byPart[m.partId] = m;
      }
    });
    return byPart;
  },
};

/* ================= کاتالوگ خدمات ================= */

const CatalogAPI = {
  getAll: async () => {
    await ensureCatalogSeeded();
    return getAll(STORES.CATALOG);
  },
  save: (item) => put(STORES.CATALOG, item),
  delete: (id) => remove(STORES.CATALOG, id),
};

/* ================= تنظیمات ================= */

const SettingsAPI = {
  get: async (key, defaultValue = null) => {
    const rec = await getById(STORES.SETTINGS, key);
    return rec ? rec.value : defaultValue;
  },
  set: (key, value) => put(STORES.SETTINGS, { key, value }),
};

export {
  DB_NAME, STORES, REMINDER_TITLES, DEFAULT_CATALOG, DEFAULT_PARTS,
  openDB, CarsAPI, ServicesAPI, RemindersAPI, CatalogAPI, MaintenanceAPI, SettingsAPI,
};
