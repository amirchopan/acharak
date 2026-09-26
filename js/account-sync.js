import {
  getAccountSnapshot,
  replaceAccountSnapshot,
  setDataChangeListener,
  SettingsAPI,
  withoutDataChangeNotifications,
} from "./database.js";
import {
  getAccountData,
  getAuthState,
  saveAccountData,
  setAuthSuccessHandler,
} from "./auth.js";

const PENDING_GUEST_DATA = "pendingGuestData";
const PENDING_GUEST_USER = "pendingGuestUser";
const PENDING_GUEST_PROMPTED = "pendingGuestPrompted";
const ACCOUNT_OWNER = "cloudAccountId";
const DIRTY_ACCOUNT_DATA = "accountDataDirty";

let confirmGuestSync = null;
let reportSyncError = null;
let syncTimer = null;
let activeSync = Promise.resolve();

function emptySnapshot() {
  return {
    cars: [],
    services: [],
    reminders: [],
    catalog: [],
    maintenance: [],
    settings: { theme: "auto" },
  };
}

function hasGuestRecords(snapshot) {
  return ["cars", "services", "reminders", "maintenance"].some(
    (key) => snapshot[key].length > 0,
  );
}

function mergeSnapshots(account, guest) {
  const merged = {};
  for (const key of ["cars", "services", "reminders", "catalog", "maintenance"]) {
    const records = new Map(account[key].map((item) => [item.id, item]));
    guest[key].forEach((item) => records.set(item.id, item));
    merged[key] = [...records.values()];
  }
  merged.settings = { ...account.settings, ...guest.settings };
  return merged;
}

async function applySnapshotLocally(snapshot) {
  await withoutDataChangeNotifications(() => replaceAccountSnapshot(snapshot));
}

async function syncSnapshot(snapshot, mode = "replace") {
  await SettingsAPI.set(DIRTY_ACCOUNT_DATA, true);
  await saveAccountData(snapshot, mode);
  await SettingsAPI.set(DIRTY_ACCOUNT_DATA, false);
}

async function promptForGuestSync(userId) {
  const pendingUserId = await SettingsAPI.get(PENDING_GUEST_USER);
  const guestSnapshot = await SettingsAPI.get(PENDING_GUEST_DATA);
  const alreadyPrompted = await SettingsAPI.get(PENDING_GUEST_PROMPTED, false);
  if (!guestSnapshot || pendingUserId !== userId || alreadyPrompted || !confirmGuestSync) return;

  const confirmed = await confirmGuestSync();
  if (!confirmed) {
    await SettingsAPI.set(PENDING_GUEST_PROMPTED, true);
    return;
  }
  await syncPendingGuestData(userId);
}

async function syncAuthenticatedAccount(user, interactive = false) {
  if (!user || typeof user.id !== "string") return;
  const ownerId = await SettingsAPI.get(ACCOUNT_OWNER);
  const localSnapshot = await getAccountSnapshot();
  if (ownerId && ownerId !== user.id) {
    try {
      await SettingsAPI.set(`offlineAccountData:${ownerId}`, localSnapshot);
    } catch (error) {
      console.error("Unable to preserve the previous local account data.", error);
      if (reportSyncError) reportSyncError(error);
    }
    await applySnapshotLocally(emptySnapshot());
    await SettingsAPI.set(ACCOUNT_OWNER, user.id);
  }

  const remote = await getAccountData();
  const cloudSnapshot = remote.data || null;

  if (ownerId && ownerId !== user.id) {
    await applySnapshotLocally(cloudSnapshot || emptySnapshot());
    await SettingsAPI.set(ACCOUNT_OWNER, user.id);
  } else if (!ownerId) {
    if (hasGuestRecords(localSnapshot)) {
      await SettingsAPI.set(PENDING_GUEST_DATA, localSnapshot);
      await SettingsAPI.set(PENDING_GUEST_USER, user.id);
      await SettingsAPI.set(PENDING_GUEST_PROMPTED, false);
      await applySnapshotLocally(cloudSnapshot || emptySnapshot());
    } else {
      await applySnapshotLocally(cloudSnapshot || emptySnapshot());
    }
    await SettingsAPI.set(ACCOUNT_OWNER, user.id);
  } else if (cloudSnapshot) {
    const dirty = await SettingsAPI.get(DIRTY_ACCOUNT_DATA, false);
    if (dirty) {
      const merged = mergeSnapshots(cloudSnapshot, localSnapshot);
      await applySnapshotLocally(merged);
      await syncSnapshot(merged);
    } else {
      await applySnapshotLocally(cloudSnapshot);
    }
  } else if (hasGuestRecords(localSnapshot)) {
    await syncSnapshot(localSnapshot);
  }

  const currentPending = await SettingsAPI.get(PENDING_GUEST_DATA);
  const currentPendingUser = await SettingsAPI.get(PENDING_GUEST_USER);
  if (currentPending && currentPendingUser === user.id && interactive) {
    await promptForGuestSync(user.id);
  }
}

async function syncPendingGuestData(userId = getAuthState().user?.id) {
  const authState = getAuthState();
  if (!authState.authenticated || !authState.user || authState.user.id !== userId) {
    throw new Error("برای همگام‌سازی اطلاعات مهمان ابتدا وارد همان حساب شوید.");
  }
  const [targetUser, guestSnapshot] = await Promise.all([
    SettingsAPI.get(PENDING_GUEST_USER),
    SettingsAPI.get(PENDING_GUEST_DATA),
  ]);
  if (!guestSnapshot || targetUser !== userId) {
    throw new Error("اطلاعات مهمانی برای همگام‌سازی این حساب وجود ندارد.");
  }

  const remote = await getAccountData();
  const merged = mergeSnapshots(remote.data || emptySnapshot(), guestSnapshot);
  await syncSnapshot(merged);
  await applySnapshotLocally(merged);
  await SettingsAPI.set(ACCOUNT_OWNER, userId);
  await SettingsAPI.set(PENDING_GUEST_DATA, null);
  await SettingsAPI.set(PENDING_GUEST_USER, null);
  await SettingsAPI.set(PENDING_GUEST_PROMPTED, false);
}

function scheduleAccountSync() {
  if (!getAuthState().authenticated) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    activeSync = activeSync
      .then(async () => {
        const authState = getAuthState();
        if (!authState.authenticated) return;
        const ownerId = await SettingsAPI.get(ACCOUNT_OWNER);
        if (!authState.user || ownerId !== authState.user.id) return;
        const snapshot = await getAccountSnapshot();
        await syncSnapshot(snapshot);
      })
      .catch((error) => {
        console.error("Account data synchronization failed.", error);
        if (reportSyncError) reportSyncError(error);
      });
  }, 500);
}

function initializeAccountSync({ confirm, onError }) {
  confirmGuestSync = confirm;
  reportSyncError = onError;
  setDataChangeListener(scheduleAccountSync);
  setAuthSuccessHandler(async (user) => {
    try {
      await syncAuthenticatedAccount(user, true);
    } catch (error) {
      console.error("Account data synchronization failed.", error);
      if (reportSyncError) reportSyncError(error);
    }
  });
  window.addEventListener("online", () => {
    const authState = getAuthState();
    if (!authState.authenticated || !authState.user) return;
    syncAuthenticatedAccount(authState.user)
      .then(scheduleAccountSync)
      .catch((error) => {
        console.error("Account data synchronization failed.", error);
        if (reportSyncError) reportSyncError(error);
      });
  });
}

export {
  initializeAccountSync,
  syncAuthenticatedAccount,
  syncPendingGuestData,
};
