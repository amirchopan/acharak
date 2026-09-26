# آچارک

آچارک یک اپلیکیشن وب پیش‌رونده (PWA) فارسی و راست‌به‌چپ برای مدیریت خودرو، ثبت سرویس‌ها و پیگیری زمان نگهداری قطعات است. اطلاعات روی دستگاه در `IndexedDB` ذخیره می‌شود و برای کاربران واردشده با Cloudflare Worker و D1 میان دستگاه‌ها همگام می‌شود.

## امکانات

- داشبورد وضعیت خودرو، کیلومتر فعلی، سرویس‌های اخیر و هزینه‌ها
- خلاصه هزینه‌های ماه جاری در داشبورد و دسترسی به گزارش هزینه از همان صفحه
- افزودن، ویرایش و حذف چند خودرو
- برند و مدل خودرو از کاتالوگ `assets/data/cars.json`
- مشخصات خودرو شامل رنگ، سال ساخت، نوع سوخت، عنوان دلخواه، تصویر و پلاک ایران
- ثبت سرویس با کیلومتر، تاریخ جلالی، هزینه، وضعیت و توضیحات
- پیگیری نگهداری قطعات با عمر بر اساس کیلومتر یا زمان
- یادآوری سرویس و معاینه فنی بر اساس تاریخ یا کیلومتر
- ثبت بیمه، پرداخت‌ها و نمایش رسید
- جست‌وجو و فیلتر سرویس‌ها
- پوسته روشن، تیره و خودکار
- پشتیبان‌گیری و بازیابی اطلاعات با فایل JSON
- عملکرد آفلاین پس از اولین بارگذاری با Service Worker
- همگام‌سازی خودروها، سرویس‌ها، یادآوری‌ها و تنظیمات حساب میان دستگاه‌ها
- انتقال اختیاری داده‌های مهمان پس از تأیید کاربر

## اجرا در محیط محلی

رابط کاربری به مرحله build نیاز ندارد؛ برای اجرای Worker و تست‌ها Node.js و npm لازم است. برای Service Worker و ES Modules باید برنامه را از طریق یک وب‌سرور اجرا کنید؛ باز کردن مستقیم `index.html` با `file://` پشتیبانی نمی‌شود.

### Windows

در پوشه پروژه یکی از این دستورها را اجرا کنید:

```powershell
py -m http.server 8080
```

یا:

```powershell
python -m http.server 8080
```

### Linux و macOS

```bash
python3 -m http.server 8080
```

سپس در مرورگر به آدرس زیر بروید:

```text
http://localhost:8080
```

برای نصب به‌عنوان اپلیکیشن، از منوی مرورگر گزینه Install یا Add to Home Screen را انتخاب کنید. نصب PWA به `localhost` یا یک اتصال HTTPS نیاز دارد.

## Cloudflare Worker و D1

Worker بک‌اند در `worker/index.mjs` و APIهای احراز هویت و اطلاعات حساب در `worker/auth.mjs` قرار دارند. پایگاه داده فقط از طریق binding سمت Worker با نام `DB` در دسترس است. احراز هویت فقط با شماره همراه و OTP است. داده‌های محلی فقط پس از ورود به حساب همگام می‌شوند؛ انتقال داده‌های مهمان نیازمند تأیید کاربر است و در صورت ردکردن، گزینهٔ انجام آن در تنظیمات باقی می‌ماند.

برای ساخت پایگاه دادهٔ Cloudflare و تنظیم شناسهٔ آن در `wrangler.jsonc`:

```powershell
npx wrangler@4 d1 create acharak-db
```

مقدار `database_id` را با شناسهٔ خروجی این دستور جایگزین کنید؛ مقدار جای‌نگهدار فعلی برای اجرای محلی است و برای انتشار production معتبر نیست.

برای فعال‌کردن OTP آزمایشی (فقط روی Worker محلی)، فایل تنظیمات محلی بسازید و مقدار نمونهٔ `AUTH_SECRET` را با یک راز تصادفی مختص محیط توسعه عوض کنید:

```powershell
Copy-Item .dev.vars.example .dev.vars
npx wrangler@4 d1 migrations apply acharak-db --local
npx wrangler@4 dev
```

Worker، کد شش‌رقمی را فقط در پاسخ محلی برای نمایش آزمایشی برمی‌گرداند؛ OTP خام در D1 ذخیره نمی‌شود. اجرای Worker محلی به همراه وب‌سرور استاتیک رابط کاربری:

```powershell
py -m http.server 8080
```

در مرورگر، `http://localhost:8080/#/register` یا `http://localhost:8080/#/login` را باز کنید. هر آدرس محلی روی `localhost` یا `127.0.0.1` به‌صورت خودکار به Worker در همان hostname و پورت `8787` وصل می‌شود؛ Worker محلی باید هم‌زمان اجرا باشد. روی سایر hostnameها، URL پیش‌فرض API همان Worker production است. برای Worker دیگری، URL آن را در `meta[name="acharak-api-url"]` در `index.html` تعیین کنید و `APP_ORIGIN` را به مبدأ دقیق رابط کاربری تنظیم کنید؛ برای cookie با `SameSite=Lax` در production، رابط کاربری و API را روی یک سایت (same-site) میزبانی کنید.

وضعیت migration محلی و health endpoint (Worker باید در ترمینال جداگانه فعال باشد) و تست‌ها:

```powershell
Invoke-RestMethod http://localhost:8787/api/health/db
npm test
```

APIهای Worker عبارت‌اند از `POST /api/auth/register`، `POST /api/auth/login`، `POST /api/auth/otp/request`، `POST /api/auth/otp/verify`، `POST /api/auth/logout`، `GET /api/auth/me` و مسیرهای احراز‌شدهٔ `GET` و `PUT /api/account/data`. برای ذخیرهٔ داده‌های حساب، migration سوم (`0003_account_data.sql`) نیز باید روی D1 اجرا شود.

پیش از انتشار، برای Worker production یک راز مستقل و مبدأ frontend را تنظیم کنید. این دو مقدار را در فایل‌های Git قرار ندهید:

```powershell
npx wrangler@4 secret put AUTH_SECRET
npx wrangler@4 secret put APP_ORIGIN
```

`AUTH_SECRET` باید دست‌کم ۳۲ نویسهٔ تصادفی داشته باشد. در پیکربندی پیش‌فرض production ارسال OTP عمداً غیرفعال است؛ تا زمان اتصال یک implementation واقعی از `OTPProvider`، APIهای register/login کد آزمایشی یا SMS ارسال نمی‌کنند و پاسخ عدم‌دسترسی می‌دهند.

پس از ورود به حساب Cloudflare و تنظیم `database_id`، migration و انتشار production:

```powershell
npx wrangler@4 d1 migrations apply acharak-db --remote
npx wrangler@4 deploy
```

پس از انتشار، endpoint سلامتی را در `https://<worker-url>/api/health/db` بررسی کنید. اجرای migration دوم، اطلاعات کاربران موجود و روابطشان را حفظ می‌کند، نام قبلی را به `first_name` منتقل می‌کند و ستون `password_hash` را حذف می‌کند. تا زمان پیاده‌سازی SMS provider، register/login در production با پاسخ `503` غیرفعال هستند؛ ارسال OTP آزمایشی فقط روی Worker محلی فعال است.

## مسیرهای برنامه

برنامه از یک hash router استفاده می‌کند:

| مسیر | صفحه |
| --- | --- |
| `#/register` | ثبت‌نام با شماره همراه |
| `#/login` | ورود با شماره همراه |
| `#/otp` | تأیید کد یک‌بارمصرف |
| `#/dashboard` | داشبورد |
| `#/cars` | خودروها |
| `#/cars/new` | افزودن خودرو |
| `#/cars/:id/edit` | ویرایش خودرو |
| `#/services` | سرویس‌ها |
| `#/services/new` | ثبت سرویس |
| `#/services/:id/edit` | ویرایش سرویس |
| `#/maintenance` | نگهداری قطعات |
| `#/settings` | تنظیمات |
| `#/settings/account` | اطلاعات حساب |
| `#/settings/appearance` | ظاهر برنامه |
| `#/settings/notifications` | اعلان‌ها و یادآوری‌ها |
| `#/reports` | گزارش هزینه (از داشبورد) |

## ساختار پروژه

```text
acharak/
├── index.html              # پوسته اصلی برنامه
├── manifest.json           # تنظیمات نصب PWA
├── service-worker.js       # کش پوسته و حالت آفلاین
├── css/
│   └── style.css           # سبک‌ها و پوسته‌ها
├── js/
│   ├── app.js              # راه‌اندازی و رندر صفحات
│   ├── account-sync.js     # همگام‌سازی داده و انتقال داده‌های مهمان
│   ├── auth.js             # وضعیت احراز هویت و ارتباط با Worker
│   ├── auth-ui.js          # فرم‌های ثبت‌نام، ورود و OTP
│   ├── components.js       # کامپوننت‌ها و پنل‌های رابط کاربری
│   ├── database.js         # لایه IndexedDB و API داده‌ها
│   ├── router.js           # مسیریابی بر اساس hash
│   ├── storage.js          # export/import پشتیبان JSON
│   └── utils.js            # ابزارهای تاریخ، اعداد، پلاک و آیکن
└── assets/
    ├── data/cars.json      # کاتالوگ برند و مدل خودرو
    ├── fonts/              # فونت‌های فارسی
    ├── icons/              # آیکن‌های PWA
    └── symbols/            # آیکن‌های رابط کاربری
```

## داده و پشتیبان‌گیری

- داده‌های خودرو، سرویس، قطعات، یادآوری‌ها و تنظیمات روی دستگاه در IndexedDB ذخیره می‌شوند؛ هنگام ورود، اطلاعات حساب از D1 بازیابی و تغییرات بعدی همگام می‌شوند.
- اطلاعات مهمان فقط پس از تأیید کاربر با حساب ترکیب می‌شود. اگر کاربر درخواست اولیه را رد کند، گزینهٔ همگام‌سازی فقط برای همان حساب در تنظیمات نمایش داده می‌شود.
- از مسیر تنظیمات، گزینه تهیه پشتیبان JSON را برای خروجی گرفتن استفاده کنید.
- برای انتقال اطلاعات، فایل JSON را از همان بخش وارد کنید.
- پاک کردن داده‌های سایت در مرورگر، اطلاعات آچارک را نیز حذف می‌کند؛ قبل از این کار پشتیبان بگیرید.

## توسعه و انتشار

کد با HTML، CSS و JavaScript ماژولار نوشته شده است و وابستگی npm ندارد. برای انتشار، کل پوشه را روی هر میزبان فایل استاتیک قرار دهید. مسیرهای نسبی پروژه با سرویس‌هایی مانند GitHub Pages سازگار هستند.

بعد از تغییر فایل‌های موجود در پوسته، مقدار `CACHE_VERSION` در `service-worker.js` را افزایش دهید تا نسخه قدیمی کش حذف شود.

## فناوری‌ها

- Progressive Web App (PWA)
- HTML، CSS و JavaScript با ES Modules
- IndexedDB
- Cloudflare Workers و D1 برای احراز هویت
- Service Worker با راهبرد cache-first و به‌روزرسانی پس‌زمینه
- تاریخ جلالی پیاده‌سازی‌شده در JavaScript
- رابط فارسی و RTL

## مجوز

این پروژه شخصی است و برای استفاده و سفارشی‌سازی ارائه شده است.
