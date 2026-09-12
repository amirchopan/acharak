/**
 * storage.js
 * پشتیبان‌گیری، خروجی JSON و ورودی JSON از کل اطلاعات برنامه
 */

import { CarsAPI, ServicesAPI, RemindersAPI, CatalogAPI, MaintenanceAPI, SettingsAPI } from './database.js';

async function exportAllData() {
  const [cars, services, reminders, catalog, maintenance] = await Promise.all([
    CarsAPI.getAll(),
    ServicesAPI.getAll(),
    RemindersAPI.getAll(),
    CatalogAPI.getAll(),
    MaintenanceAPI.getAll(),
  ]);
  const theme = await SettingsAPI.get('theme', 'auto');
  return {
    meta: {
      app: 'آچارک',
      version: 2,
      exportedAt: new Date().toISOString(),
    },
    data: { cars, services, reminders, catalog, maintenance, settings: { theme } },
  };
}

/** دانلود فایل JSON خروجی */
async function downloadBackupFile() {
  const payload = await exportAllData();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  a.href = url;
  a.download = `car-service-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** خواندن و اعتبارسنجی فایل JSON ورودی */
function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error('فایل انتخاب‌شده یک JSON معتبر نیست.'));
      }
    };
    reader.onerror = () => reject(new Error('خواندن فایل با خطا مواجه شد.'));
    reader.readAsText(file);
  });
}

/**
 * وارد کردن اطلاعات از فایل JSON.
 * mode: 'replace' (پاک‌کردن کامل و جایگزینی) یا 'merge' (افزودن/به‌روزرسانی)
 */
async function importFromFile(file, mode = 'merge') {
  const parsed = await readJSONFile(file);
  if (!parsed || !parsed.data || !Array.isArray(parsed.data.cars)) {
    throw new Error('ساختار فایل پشتیبان معتبر نیست.');
  }
  const {
    cars = [],
    services = [],
    reminders = [],
    catalog = [],
    maintenance = [],
    settings = {},
  } = parsed.data;

  if (mode === 'replace') {
    const [existingCars, existingServices, existingReminders, existingMaint] = await Promise.all([
      CarsAPI.getAll(), ServicesAPI.getAll(), RemindersAPI.getAll(), MaintenanceAPI.getAll(),
    ]);
    await Promise.all(existingCars.map((c) => CarsAPI.delete(c.id)));
    await Promise.all(existingServices.map((s) => ServicesAPI.delete(s.id)));
    await Promise.all(existingReminders.map((r) => RemindersAPI.delete(r.id)));
    await Promise.all(existingMaint.map((m) => MaintenanceAPI.delete(m.id)));
  }

  await Promise.all(cars.map((c) => CarsAPI.save(c)));
  await Promise.all(services.map((s) => ServicesAPI.save(s)));
  await Promise.all(reminders.map((r) => RemindersAPI.save(r)));
  if (Array.isArray(catalog) && catalog.length) {
    await Promise.all(catalog.map((item) => CatalogAPI.save(item)));
  }
  if (Array.isArray(maintenance) && maintenance.length) {
    await Promise.all(maintenance.map((item) => MaintenanceAPI.save(item)));
  }
  if (settings && settings.theme) {
    await SettingsAPI.set('theme', settings.theme);
  }
  return {
    carsCount: cars.length,
    servicesCount: services.length,
    remindersCount: reminders.length,
    maintenanceCount: maintenance.length,
  };
}

export { exportAllData, downloadBackupFile, importFromFile, readJSONFile };
