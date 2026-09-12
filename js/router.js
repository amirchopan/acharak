/**
 * router.js
 * روتر ساده مبتنی بر hash برای اپلیکیشن تک‌صفحه‌ای (SPA)
 */

const routes = [];

/** ثبت یک مسیر. pattern می‌تواند شامل پارامتر باشد مثل #/car/:id */
function registerRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:[a-zA-Z]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  });
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ regex, paramNames, handler, pattern });
}

function matchRoute(hash) {
  for (const r of routes) {
    const match = hash.match(r.regex);
    if (match) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      return { handler: r.handler, params, pattern: r.pattern };
    }
  }
  return null;
}

let currentCleanup = null;

async function handleRouteChange() {
  const hash = window.location.hash || '#/dashboard';
  const matched = matchRoute(hash.split('?')[0]);
  const appRoot = document.getElementById('app');
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { /* بی‌خطر */ }
    currentCleanup = null;
  }
  if (!matched) {
    window.location.hash = '#/dashboard';
    return;
  }
  appRoot.classList.add('is-loading');
  try {
    const cleanup = await matched.handler(matched.params, appRoot);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } finally {
    appRoot.classList.remove('is-loading');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
}

function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('DOMContentLoaded', handleRouteChange);
  if (document.readyState !== 'loading') handleRouteChange();
}

function navigate(hash) {
  if (window.location.hash === hash) {
    handleRouteChange();
  } else {
    window.location.hash = hash;
  }
}

export { registerRoute, initRouter, navigate };
