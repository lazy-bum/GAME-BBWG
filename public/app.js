import { requestJson } from './js/api.js';
import { ACCOUNT_STATUS, VISITOR_LOG_BATCH_SIZE } from './js/constants.js';
import { refreshCreateDom, refreshRedeemDom } from './js/domRefresh.js';
import { bindLoginEvents, bindLogoutEvents } from './js/events/authEvents.js';
import { bindCreateEvents } from './js/events/createEvents.js';
import { bindGroupEvents } from './js/events/groupEvents.js';
import { bindListEvents } from './js/events/listEvents.js';
import { bindMediaEvents } from './js/events/mediaEvents.js';
import { bindRedeemEvents } from './js/events/redeemEvents.js';
import { bindRedeemCodeManagementEvents } from './js/events/redeemCodeManagementEvents.js';
import { bindRouteEvents } from './js/events/routeEvents.js';
import { bindUserEvents } from './js/events/userEvents.js';
import { bindVisitorEvents } from './js/events/visitorEvents.js';
import { extractFailureReason, getDefaultRedeemStatus } from './js/redeemStatus.js';
import { REDEEM_TARGET_MODE } from './js/redeemTargets.js';
import { createJsonEventSource } from './js/sse.js';
import { readStoredRedeemCode, writeStoredRedeemCode } from './js/storage.js';
import {
  renderAccountBlacklistModal as renderBlacklistModal,
  renderAccountMissingRedeemCodesModal
} from './js/accountViews.js';
import { renderCreatePage as renderCreateView } from './js/views/createView.js';
import { renderGroupsPage as renderGroupsView } from './js/views/groupsView.js';
import { renderHomePage as renderHomeView } from './js/views/homeView.js';
import { renderListPage as renderListView } from './js/views/listView.js';
import { renderLoginPage as renderLoginView } from './js/views/loginView.js';
import { renderRedeemCodeManagementPage as renderRedeemCodeManagementView } from './js/views/redeemCodeManagementView.js';
import { renderRedeemPage as renderRedeemView } from './js/views/redeemView.js';
import { createShell } from './js/views/shellView.js';
import { renderUsersPage as renderUsersView } from './js/views/usersView.js';
import { renderVisitorPage as renderVisitorView } from './js/views/visitorView.js';

const app = document.querySelector('#app');
const MAX_REDEEM_LOGS = 300;
let currentRoute = 'home';
let authChecked = false;
let isAuthenticated = false;
let authUsername = '';
let authRole = '';
let authError = '';
let allowRegistration = false;
let accountIdFilter = '';
let gameNameFilter = '';
let importIsRunning = false;
let importProcessed = 0;
let importTotal = 0;
let importInserted = 0;
let importSkipped = 0;
let importFailed = 0;
let importCurrentAccountId = '';
let redeemCode = readStoredRedeemCode();
let redeemToken = '';
let redeemIsRunning = false;
let redeemProcessed = 0;
let redeemTotal = 0;
let redeemCodeProcessed = 0;
let redeemCodeTotal = 0;
let redeemCurrentCode = '';
let redeemCodeSummaries = [];
let redeemLogs = [];
let redeemLogsVersion = 0;
let redeemCodeSummariesVersion = 0;
let redeemProgressSubscribed = false;
let redeemConfigLoaded = false;
let redeemAccounts = [];
let redeemStatuses = {};
let redeemTargetMode = REDEEM_TARGET_MODE.all;
let redeemTargetAccountIds = new Set();
let redeemCollapsedGroupIds = new Set();
let listAccountsCache = [];
let blacklistedAccounts = [];
let accountBlacklistModalOpen = false;
let accountMissingRedeemCodesModal = null;
let accountBackupFeedback = null;
let accountGroups = [];
let selectedAccountIds = new Set();
let accountGroupFilter = 'ungrouped';
let visitorLogs = [];
let visitorLogRetentionDays = 30;
let visitorBlacklist = [];
let visitorBlockTargetIp = '';
let visitorPathFilter = '';
let visitorLogOffset = 0;
let visitorLogsHasMore = true;
let visitorLogsLoadingMore = false;
let visitorLogRequestVersion = 0;
let redeemCodeItems = [];
let redeemCodeFailedAccountsModal = null;
let systemUsers = [];
let listDataLoaded = false;
let redeemAccountsLoaded = false;
let groupsDataLoaded = false;
let visitorsDataLoaded = false;
let redeemCodesDataLoaded = false;
let usersDataLoaded = false;

let eventSource = null;
let importEventSource = null;
let namePopupDismissBound = false;
let visitorLogObserver = null;
let renderSequence = 0;

function persistRedeemCode(value) {
  redeemCode = value.trim();
  writeStoredRedeemCode(redeemCode);
}

function getRedeemStatusView(account) {
  return redeemStatuses[account.accountId] ?? getDefaultRedeemStatus(account.status);
}

function isAdminUser() {
  return authRole === 'admin';
}

function getNormalizedVisitorPathFilter() {
  return visitorPathFilter.trim();
}

function ensureEventSource() {
  if (!isAuthenticated) {
    return;
  }

  if (eventSource) {
    return;
  }

  eventSource = createJsonEventSource('/api/redeem/events', {
    onMessage: (payload) => {
      if (!redeemProgressSubscribed) {
        return;
      }

      if (payload.type === 'start') {
        redeemTotal = payload.total ?? 0;
        redeemProcessed = payload.processed ?? 0;
        if (payload.totalCodes) {
          redeemCodeTotal = payload.totalCodes;
          redeemCodeProcessed = Math.max(0, (payload.currentCodeIndex ?? 1) - 1);
          redeemCurrentCode = payload.currentCode ?? '';
        }
      }

      if (payload.type === 'log' && payload.message) {
        redeemLogs = [
          ...redeemLogs,
          {
            level: payload.level ?? 'info',
            message: payload.message
          }
        ].slice(-MAX_REDEEM_LOGS);
        redeemLogsVersion += 1;
        syncRedeemStatusFromLog(payload.message);
      }

      if (payload.type === 'progress') {
        redeemProcessed = payload.processed ?? redeemProcessed;
        redeemTotal = payload.total ?? redeemTotal;
        if (payload.totalCodes) {
          redeemCodeTotal = payload.totalCodes;
          redeemCodeProcessed = Math.max(0, (payload.currentCodeIndex ?? 1) - 1);
          redeemCurrentCode = payload.currentCode ?? redeemCurrentCode;
        }
      }

      if (payload.type === 'done' && payload.summary) {
        redeemProcessed = payload.summary.processed ?? redeemProcessed;
        redeemTotal = payload.summary.total ?? redeemTotal;
        if (payload.currentCode) {
          redeemCodeTotal = payload.totalCodes ?? redeemCodeTotal;
          redeemCodeProcessed = payload.currentCodeIndex ?? redeemCodeProcessed;
          redeemCurrentCode = payload.currentCode;
          redeemCodeSummaries = [
            ...redeemCodeSummaries.filter((item) => item.giftCode !== payload.currentCode),
            { giftCode: payload.currentCode, summary: payload.summary }
          ];
          redeemCodeSummariesVersion += 1;
        }
      }

      refreshRedeemUi();
    },
    onDisconnect: () => {
      eventSource = null;
      setTimeout(ensureEventSource, 1500);
    }
  });
}

function ensureImportEventSource() {
  if (!isAuthenticated) {
    return;
  }

  if (importEventSource) {
    return;
  }

  importEventSource = createJsonEventSource('/api/accounts/import-events', {
    onMessage: (payload) => {
      if (payload.type === 'start') {
        importIsRunning = true;
        importTotal = payload.total ?? 0;
        importProcessed = payload.processed ?? 0;
        importInserted = payload.inserted ?? 0;
        importSkipped = payload.skipped ?? 0;
        importFailed = payload.failed ?? 0;
        importCurrentAccountId = '';
      }

      if (payload.type === 'progress') {
        importIsRunning = true;
        importTotal = payload.total ?? importTotal;
        importProcessed = payload.processed ?? importProcessed;
        importInserted = payload.inserted ?? importInserted;
        importSkipped = payload.skipped ?? importSkipped;
        importFailed = payload.failed ?? importFailed;
        importCurrentAccountId = payload.accountId ?? '';
      }

      if (payload.type === 'done') {
        importIsRunning = false;
        importTotal = payload.total ?? importTotal;
        importProcessed = payload.processed ?? importProcessed;
        importInserted = payload.inserted ?? importInserted;
        importSkipped = payload.skipped ?? importSkipped;
        importFailed = payload.failed ?? importFailed;
        importCurrentAccountId = '';
      }

      refreshCreateUi();
    },
    onDisconnect: () => {
      importEventSource = null;
      setTimeout(ensureImportEventSource, 1500);
    }
  });
}

async function api(path, options) {
  const result = await requestJson(path, options, () => {
    isAuthenticated = false;
    authChecked = true;
    authUsername = '';
    authRole = '';
    closeEventSource();
    closeImportEventSource();
    void render();
  });
  const method = options?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET') {
    if (path.startsWith('/api/accounts')) {
      listDataLoaded = false;
      redeemAccountsLoaded = false;
    }
    if (path.startsWith('/api/account-groups') || path === '/api/accounts/group') {
      listDataLoaded = false;
      groupsDataLoaded = false;
      redeemAccountsLoaded = false;
    }
    if (path.startsWith('/api/visitor-')) {
      visitorsDataLoaded = false;
    }
    if (path.startsWith('/api/redeem-codes')) {
      redeemCodesDataLoaded = false;
    }
  }
  return result;
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  redeemProgressSubscribed = false;
}

function closeImportEventSource() {
  if (importEventSource) {
    importEventSource.close();
    importEventSource = null;
  }
}

function getRouteFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'create' || hash === 'list' || hash === 'redeem' || hash === 'redeem-codes' || hash === 'groups' || hash === 'visitors' || hash === 'users') {
    return hash;
  }
  return 'home';
}

function navigate(route) {
  currentRoute = route;
  if (route !== 'visitors') {
    disconnectVisitorLogObserver();
  }
  if (route !== 'list') {
    accountBlacklistModalOpen = false;
    selectedAccountIds = new Set();
    accountGroupFilter = 'ungrouped';
    accountBackupFeedback = null;
  }
  const nextHash = route === 'home' ? '' : `#${route}`;
  if (window.location.hash === nextHash) {
    void render();
    return;
  }
  window.location.hash = nextHash;
}

function shell(content, pageClass = '') {
  return createShell(content, { currentRoute, authUsername, authRole, pageClass });
}

function normalizeRedeemTargetSelection() {
  const accountIdSet = new Set(redeemAccounts.map((account) => account.accountId));
  redeemTargetAccountIds = new Set([...redeemTargetAccountIds].filter((accountId) => accountIdSet.has(accountId)));
  const groupIdSet = new Set(accountGroups.map((group) => group.groupId));
  groupIdSet.add('__ungrouped__');
  redeemCollapsedGroupIds = new Set([...redeemCollapsedGroupIds].filter((groupId) => groupIdSet.has(groupId)));
}

async function renderListPage(refreshData = true) {
  if (refreshData) {
    const [accounts, adminBlacklistedAccounts, adminGroups] = await Promise.all([
      api('/api/accounts'),
      isAdminUser() ? api('/api/accounts/blacklist') : Promise.resolve([]),
      isAdminUser() ? api('/api/account-groups') : Promise.resolve([])
    ]);
    listAccountsCache = accounts;
    blacklistedAccounts = adminBlacklistedAccounts;
    accountGroups = adminGroups;
    listDataLoaded = true;
  }
  const accountIdSet = new Set(listAccountsCache.map((account) => account.accountId));
  selectedAccountIds = new Set([...selectedAccountIds].filter((accountId) => accountIdSet.has(accountId)));
  if (
    isAdminUser() &&
    accountGroupFilter !== 'all' &&
    accountGroupFilter !== 'ungrouped' &&
    !accountGroups.some((group) => group.groupId === accountGroupFilter)
  ) {
    accountGroupFilter = 'ungrouped';
  }
  const normalizedAccountIdFilter = accountIdFilter.trim().toLowerCase();
  const normalizedGameNameFilter = gameNameFilter.trim().toLowerCase();
  const filteredAccounts = listAccountsCache.filter((account) => {
    const groupMatches =
      !isAdminUser() ||
      accountGroupFilter === 'all' ||
      (accountGroupFilter === 'ungrouped' ? !account.groupId : account.groupId === accountGroupFilter);
    const accountIdMatches =
      normalizedAccountIdFilter === '' || account.accountId.toLowerCase().includes(normalizedAccountIdFilter);
    const gameNameMatches =
      normalizedGameNameFilter === '' || account.name.trim().toLowerCase().includes(normalizedGameNameFilter);
    return groupMatches && accountIdMatches && gameNameMatches;
  });
  const allVisibleSelected =
    filteredAccounts.length > 0 && filteredAccounts.every((account) => selectedAccountIds.has(account.accountId));
  return renderListView(shell, {
    isAdmin: isAdminUser(),
    accounts: listAccountsCache,
    filteredAccounts,
    accountGroups,
    accountGroupFilter,
    accountIdFilter,
    gameNameFilter,
    blacklistedAccounts,
    selectedAccountIds,
    allVisibleSelected,
    accountBlacklistModal: renderBlacklistModal({
      isAdmin: isAdminUser(),
      blacklistedAccounts,
      accountBlacklistModalOpen
    }),
    accountMissingRedeemCodesModal: renderAccountMissingRedeemCodesModal({
      accountMissingRedeemCodesModal
    }),
    accountBackupFeedback
  });
}

function disconnectVisitorLogObserver() {
  if (visitorLogObserver) {
    visitorLogObserver.disconnect();
    visitorLogObserver = null;
  }
}

async function fetchVisitorBlacklist() {
  visitorBlacklist = (await api('/api/visitor-blacklist')) || [];
}

async function fetchVisitorLogsPage({ reset = false, renderWhileLoading = false } = {}) {
  if (!reset && (visitorLogsLoadingMore || !visitorLogsHasMore)) {
    return false;
  }

  const normalizedPathFilter = getNormalizedVisitorPathFilter();
  const startOffset = reset ? 0 : visitorLogOffset;
  const params = new URLSearchParams({
    limit: String(VISITOR_LOG_BATCH_SIZE),
    offset: String(startOffset)
  });
  if (normalizedPathFilter) {
    params.set('path', normalizedPathFilter);
  }

  const requestVersion = ++visitorLogRequestVersion;
  visitorLogsLoadingMore = true;
  if (renderWhileLoading && currentRoute === 'visitors') {
    await render({ refreshData: false });
    if (requestVersion !== visitorLogRequestVersion) {
      return false;
    }
  }

  try {
    const logResult = await api(`/api/visitor-logs?${params.toString()}`);
    if (requestVersion !== visitorLogRequestVersion) {
      return false;
    }

    const items = Array.isArray(logResult?.items) ? logResult.items : [];
    const retentionDays = Number(logResult?.retentionDays);
    visitorLogs = reset ? items : [...visitorLogs, ...items];
    visitorLogRetentionDays = Number.isFinite(retentionDays) ? retentionDays : 0;
    visitorLogOffset = startOffset + items.length;
    visitorLogsHasMore = Boolean(logResult?.hasMore);
    visitorsDataLoaded = true;
    return true;
  } finally {
    if (requestVersion === visitorLogRequestVersion) {
      visitorLogsLoadingMore = false;
    }
  }
}

async function reloadVisitorLogs({ refreshBlacklist = false } = {}) {
  if (currentRoute !== 'visitors' || !isAdminUser()) {
    return;
  }

  disconnectVisitorLogObserver();
  try {
    if (refreshBlacklist) {
      await Promise.all([fetchVisitorLogsPage({ reset: true, renderWhileLoading: true }), fetchVisitorBlacklist()]);
    } else {
      await fetchVisitorLogsPage({ reset: true, renderWhileLoading: true });
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '加载访问记录失败');
  } finally {
    if (currentRoute === 'visitors') {
      await render({ refreshData: false });
    }
  }
}

async function loadMoreVisitorLogs() {
  if (currentRoute !== 'visitors' || !isAdminUser()) {
    return;
  }

  try {
    await fetchVisitorLogsPage({ renderWhileLoading: true });
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '加载更多访问记录失败');
  } finally {
    if (currentRoute === 'visitors') {
      await render({ refreshData: false });
    }
  }
}

function setupVisitorLogObserver() {
  disconnectVisitorLogObserver();

  if (currentRoute !== 'visitors' || visitorLogsLoadingMore || !visitorLogsHasMore) {
    return;
  }

  const loadMoreElement = document.querySelector('#visitor-log-load-more');
  if (!loadMoreElement) {
    return;
  }

  visitorLogObserver = new IntersectionObserver(
    (entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) {
        return;
      }

      disconnectVisitorLogObserver();
      void loadMoreVisitorLogs();
    },
    {
      root: null,
      rootMargin: '120px 0px',
      threshold: 0.1
    }
  );

  visitorLogObserver.observe(loadMoreElement);
}

async function render({ refreshData = true } = {}) {
  if (!app) {
    return;
  }
  const sequence = ++renderSequence;
  const route = currentRoute;

  if (!authChecked) {
    app.innerHTML = '';
    return;
  }

  if (!isAuthenticated) {
    app.innerHTML = renderLoginView({ authError, allowRegistration });
    bindEvents();
    return;
  }

  if (!redeemConfigLoaded) {
    const config = await api('/api/config/redeem');
    if (sequence !== renderSequence) {
      return;
    }
    redeemToken = config.redeemToken;
    redeemConfigLoaded = true;
  }

  if ((currentRoute === 'visitors' || currentRoute === 'groups' || currentRoute === 'redeem-codes' || currentRoute === 'users') && !isAdminUser()) {
    currentRoute = 'home';
    window.location.hash = '';
  }

  if (currentRoute === 'redeem' && refreshData) {
    const [accounts, adminGroups] = await Promise.all([
      api('/api/accounts'),
      isAdminUser() ? api('/api/account-groups') : Promise.resolve([])
    ]);
    redeemAccounts = accounts;
    accountGroups = adminGroups;
    normalizeRedeemTargetSelection();
    redeemAccountsLoaded = true;
  }

  if (currentRoute === 'visitors' && isAdminUser() && refreshData && !visitorsDataLoaded) {
    await Promise.all([fetchVisitorLogsPage({ reset: true }), fetchVisitorBlacklist()]);
  }

  if (currentRoute === 'redeem-codes' && isAdminUser() && refreshData) {
    redeemCodeItems = await api('/api/redeem-codes?limit=500');
    redeemCodesDataLoaded = true;
  }

  if (currentRoute === 'groups' && isAdminUser() && refreshData) {
    accountGroups = await api('/api/account-groups');
    groupsDataLoaded = true;
  }

  if (currentRoute === 'users' && isAdminUser() && refreshData) {
    systemUsers = await api('/api/users');
    usersDataLoaded = true;
  }

  if (sequence !== renderSequence || route !== currentRoute) {
    return;
  }

  if (currentRoute === 'home') {
    app.innerHTML = renderHomeView(shell, { isAdmin: isAdminUser() });
  } else if (currentRoute === 'create') {
    app.innerHTML = renderCreateView(shell, {
      importIsRunning,
      importProcessed,
      importTotal,
      importInserted,
      importSkipped,
      importFailed,
      importCurrentAccountId
    });
  } else if (currentRoute === 'list') {
    const listHtml = await renderListPage(refreshData);
    if (sequence !== renderSequence || route !== currentRoute) {
      return;
    }
    app.innerHTML = listHtml;
  } else if (currentRoute === 'groups' && isAdminUser()) {
    app.innerHTML = renderGroupsView(shell, { accountGroups });
  } else if (currentRoute === 'users' && isAdminUser()) {
    app.innerHTML = renderUsersView(shell, { users: systemUsers });
  } else if (currentRoute === 'redeem-codes' && isAdminUser()) {
    app.innerHTML = renderRedeemCodeManagementView(shell, {
      isAdmin: isAdminUser(),
      redeemCodeItems,
      redeemCodeFailedAccountsModal
    });
  } else if (currentRoute === 'visitors' && isAdminUser()) {
    app.innerHTML = renderVisitorView(shell, {
      visitorLogs,
      visitorLogRetentionDays,
      visitorBlacklist,
      visitorBlockTargetIp,
      visitorPathFilter,
      visitorLogsHasMore,
      visitorLogsLoadingMore
    });
  } else {
    app.innerHTML = renderRedeemView(shell, {
      isAdmin: isAdminUser(),
      redeemToken,
      redeemCode,
      redeemIsRunning,
      redeemProcessed,
      redeemTotal,
      redeemCodeProcessed,
      redeemCodeTotal,
      redeemCurrentCode,
      redeemCodeSummaries,
      redeemLogs,
      redeemLogsVersion,
      redeemCodeSummariesVersion,
      redeemAccounts,
      accountGroups,
      redeemTargetMode,
      redeemTargetAccountIds: [...redeemTargetAccountIds],
      redeemCollapsedGroupIds: [...redeemCollapsedGroupIds],
      redeemVisibleAccountIds: redeemAccounts.map((account) => account.accountId),
      retryableCodeFailures: getRetryableCodeFailures(),
      getRedeemStatusView
    });
  }

  bindEvents();
  setupVisitorLogObserver();
}

function bindEvents() {
  if (!authChecked) {
    return;
  }

  if (!isAuthenticated) {
    bindLoginEvents({
      api,
      render,
      setAuthError: (message) => {
        authError = message;
      },
      getAllowRegistration: () => allowRegistration,
      setAllowRegistration: (value) => {
        allowRegistration = value;
      },
      onLoginSuccess: ({ username, role }) => {
        isAuthenticated = true;
        authUsername = username;
        authRole = role;
        redeemConfigLoaded = false;
        authError = '';
        allowRegistration = false;
        ensureEventSource();
      }
    });
    return;
  }

  ensureEventSource();
  ensureImportEventSource();
  ensureRedeemProgressSubscription();

  bindRouteEvents({ navigate });

  bindLogoutEvents({
    api,
    render,
    onLogout: () => {
      isAuthenticated = false;
      authUsername = '';
      authRole = '';
      authChecked = true;
      redeemConfigLoaded = false;
      allowRegistration = false;
      redeemAccounts = [];
      redeemStatuses = {};
      blacklistedAccounts = [];
      accountBlacklistModalOpen = false;
      accountMissingRedeemCodesModal = null;
      accountBackupFeedback = null;
      accountGroups = [];
      selectedAccountIds = new Set();
      accountGroupFilter = 'ungrouped';
      redeemTargetMode = REDEEM_TARGET_MODE.all;
      redeemTargetAccountIds = new Set();
      redeemCollapsedGroupIds = new Set();
      visitorLogs = [];
      visitorBlacklist = [];
      visitorPathFilter = '';
      visitorLogOffset = 0;
      visitorLogsHasMore = true;
      visitorLogsLoadingMore = false;
      visitorLogRequestVersion = 0;
      redeemCodeItems = [];
      redeemCodeFailedAccountsModal = null;
      systemUsers = [];
      listDataLoaded = false;
      redeemAccountsLoaded = false;
      groupsDataLoaded = false;
      visitorsDataLoaded = false;
      redeemCodesDataLoaded = false;
      usersDataLoaded = false;
      disconnectVisitorLogObserver();
      closeEventSource();
      closeImportEventSource();
    }
  });

  bindCreateEvents({
    api,
    render,
    refreshCreateUi,
    setImportState: (patch) => {
      if (Object.hasOwn(patch, 'importIsRunning')) importIsRunning = patch.importIsRunning;
      if (Object.hasOwn(patch, 'importProcessed')) importProcessed = patch.importProcessed;
      if (Object.hasOwn(patch, 'importTotal')) importTotal = patch.importTotal;
      if (Object.hasOwn(patch, 'importInserted')) importInserted = patch.importInserted;
      if (Object.hasOwn(patch, 'importSkipped')) importSkipped = patch.importSkipped;
      if (Object.hasOwn(patch, 'importFailed')) importFailed = patch.importFailed;
      if (Object.hasOwn(patch, 'importCurrentAccountId')) importCurrentAccountId = patch.importCurrentAccountId;
    }
  });
  bindGroupEvents({ api, render });
  bindUserEvents({ api, render });
  bindRedeemCodeManagementEvents({
    api,
    render,
    renderLocal: () => render({ refreshData: false }),
    getRedeemCodeItems: () => redeemCodeItems,
    setRedeemCodeFailedAccountsModal: (value) => {
      redeemCodeFailedAccountsModal = value;
    }
  });
  bindVisitorEvents({
    api,
    render,
    renderLocal: () => render({ refreshData: false }),
    reloadVisitorLogs,
    getVisitorBlockTargetIp: () => visitorBlockTargetIp,
    setVisitorBlockTargetIp: (value) => {
      visitorBlockTargetIp = value;
    },
    setVisitorPathFilter: (value) => {
      visitorPathFilter = value;
    },
    clearVisitorLogs: () => {
      visitorLogs = [];
      visitorLogOffset = 0;
      visitorLogsHasMore = false;
      visitorLogsLoadingMore = false;
    },
    disconnectVisitorLogObserver
  });
  bindListEvents({
    api,
    render,
    renderLocal: () => render({ refreshData: false }),
    isAdmin: isAdminUser,
    getCurrentRoute: () => currentRoute,
    getFilters: () => ({ accountIdFilter, gameNameFilter }),
    setFilters: (filters) => {
      accountIdFilter = filters.accountIdFilter;
      gameNameFilter = filters.gameNameFilter;
    },
    getSelectedAccountIds: () => selectedAccountIds,
    setSelectedAccountIds: (value) => {
      selectedAccountIds = value;
    },
    setAccountBlacklistModalOpen: (value) => {
      accountBlacklistModalOpen = value;
    },
    getAccountMissingRedeemCodesModal: () => accountMissingRedeemCodesModal,
    setAccountMissingRedeemCodesModal: (value) => {
      accountMissingRedeemCodesModal = value;
    },
    getAccountBackupFeedback: () => accountBackupFeedback,
    setAccountBackupFeedback: (value) => {
      accountBackupFeedback = value;
    },
    getAccountGroupFilter: () => accountGroupFilter,
    setAccountGroupFilter: (value) => {
      accountGroupFilter = value;
    },
    getListAccountsCache: () => listAccountsCache,
    setListAccountsCache: (value) => {
      listAccountsCache = value;
    },
    isNamePopupDismissBound: () => namePopupDismissBound,
    markNamePopupDismissBound: () => {
      namePopupDismissBound = true;
    }
  });
  bindRedeemEvents({
    api,
    render,
    getCurrentRoute: () => currentRoute,
    getRedeemCode: () => redeemCode,
    getRedeemIsRunning: () => redeemIsRunning,
    persistRedeemCode,
    getRedeemAccounts: () => redeemAccounts,
    getRedeemTargetMode: () => redeemTargetMode,
    getRedeemTargetAccountIds: () => redeemTargetAccountIds,
    getRedeemCollapsedGroupIds: () => redeemCollapsedGroupIds,
    setRedeemTargetMode: (value) => {
      redeemTargetMode = value;
    },
    setRedeemTargetAccountIds: (value) => {
      redeemTargetAccountIds = value;
    },
    setRedeemCollapsedGroupIds: (value) => {
      redeemCollapsedGroupIds = value;
    },
    getRetryableCodeFailures,
    setRedeemToken: (value) => {
      redeemToken = value;
    },
    setRedeemStatuses: (patch) => {
      redeemStatuses = typeof patch === 'function' ? patch(redeemStatuses) : patch;
    },
    setRedeemState: (patch) => {
      const nextPatch =
        typeof patch === 'function'
          ? patch({
              redeemLogs,
              redeemStatuses,
              redeemAccounts,
              redeemIsRunning,
              redeemProcessed,
              redeemTotal,
              redeemCodeProcessed,
              redeemCodeTotal,
              redeemCurrentCode,
              redeemCodeSummaries,
              redeemLogsVersion,
              redeemCodeSummariesVersion
            })
          : patch;
      if (Object.hasOwn(nextPatch, 'redeemIsRunning')) redeemIsRunning = nextPatch.redeemIsRunning;
      if (Object.hasOwn(nextPatch, 'redeemProcessed')) redeemProcessed = nextPatch.redeemProcessed;
      if (Object.hasOwn(nextPatch, 'redeemTotal')) redeemTotal = nextPatch.redeemTotal;
      if (Object.hasOwn(nextPatch, 'redeemCodeProcessed')) redeemCodeProcessed = nextPatch.redeemCodeProcessed;
      if (Object.hasOwn(nextPatch, 'redeemCodeTotal')) redeemCodeTotal = nextPatch.redeemCodeTotal;
      if (Object.hasOwn(nextPatch, 'redeemCurrentCode')) redeemCurrentCode = nextPatch.redeemCurrentCode;
      if (Object.hasOwn(nextPatch, 'redeemCodeSummaries')) {
        redeemCodeSummaries = nextPatch.redeemCodeSummaries;
        redeemCodeSummariesVersion += 1;
      }
      if (Object.hasOwn(nextPatch, 'redeemLogs')) {
        redeemLogs = nextPatch.redeemLogs.slice(-MAX_REDEEM_LOGS);
        redeemLogsVersion += 1;
      }
      if (Object.hasOwn(nextPatch, 'redeemStatuses')) redeemStatuses = nextPatch.redeemStatuses;
      if (Object.hasOwn(nextPatch, 'redeemAccounts')) redeemAccounts = nextPatch.redeemAccounts;
    }
  });

  bindMediaEvents();
}

function ensureRedeemProgressSubscription() {
  if (redeemProgressSubscribed) {
    return;
  }

  redeemProgressSubscribed = true;
}

function refreshRedeemUi() {
  if (currentRoute !== 'redeem') {
    return;
  }

  refreshRedeemDom({
    redeemTotal,
    redeemProcessed,
    redeemCodeProcessed,
    redeemCodeTotal,
    redeemCurrentCode,
    redeemCodeSummaries,
    redeemLogs,
    redeemLogsVersion,
    redeemCodeSummariesVersion,
    redeemIsRunning,
    redeemCode,
    redeemAccounts,
    redeemTargetMode,
    redeemTargetAccountIds: [...redeemTargetAccountIds],
    redeemCollapsedGroupIds: [...redeemCollapsedGroupIds],
    redeemVisibleAccountIds: redeemAccounts.map((account) => account.accountId),
    accountGroups,
    retryableCodeFailures: getRetryableCodeFailures(),
    getRedeemStatusView
  });

  if ((redeemCodeSummaries.length > 0 && !document.querySelector('.redeem-summary')) || (redeemLogs.length > 0 && !document.querySelector('.redeem-log-panel'))) {
    void render({ refreshData: false });
  }
}

function refreshCreateUi() {
  if (currentRoute !== 'create') {
    return;
  }

  refreshCreateDom({
    importIsRunning,
    importProcessed,
    importTotal,
    importInserted,
    importSkipped,
    importFailed,
    importCurrentAccountId
  });

  if (!document.querySelector('.create-progress') && (importIsRunning || importTotal > 0)) {
    void render();
  }
}

function syncRedeemStatusFromLog(message) {
  const matched = message.match(/\(([^)]+)\)/);
  if (!matched) {
    return;
  }
  const accountId = matched[1];
  const normalizedMessage = message.toUpperCase();

  if (message.includes('开始处理')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.pending, text: '处理中' };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.pending);
    return;
  }
  if (message.includes('登录成功')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.pending, text: '登录成功' };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.pending);
    return;
  }
  if (message.includes('兑换成功-等级不足') || normalizedMessage.includes('STOVE_LV ERROR')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.redeemed, text: '等级不足' };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.redeemed);
    return;
  }
  if (message.includes('兑换成功')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.redeemed, text: '兑换成功' };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.redeemed);
    return;
  }
  if (message.includes('已领取')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.redeemed, text: '已领取' };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.redeemed);
    return;
  }
  if (message.includes('登录失败')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.failed, text: extractFailureReason(message, '登录失败') };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.failed);
    return;
  }
  if (message.includes('登录请求失败')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.failed, text: extractFailureReason(message, '登录请求失败') };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.failed);
    return;
  }
  if (message.includes('兑换请求失败')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.failed, text: extractFailureReason(message, '兑换请求失败') };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.failed);
    return;
  }
  if (message.includes('兑换失败')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.failed, text: extractFailureReason(message, '兑换失败') };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.failed);
    return;
  }
  if (message.includes('异常')) {
    redeemStatuses[accountId] = { code: ACCOUNT_STATUS.failed, text: extractFailureReason(message, '异常') };
    updateLocalAccountStatus(accountId, ACCOUNT_STATUS.failed);
  }
}

function getRetryableCodeFailures() {
  return redeemCodeSummaries
    .map((item) => ({
      giftCode: item.giftCode,
      accountIds: Array.isArray(item.summary?.failedAccountIds) ? item.summary.failedAccountIds : []
    }))
    .filter((item) => item.giftCode && item.accountIds.length > 0);
}

function updateLocalAccountStatus(accountId, status) {
  const account = redeemAccounts.find((item) => item.accountId === accountId);
  if (account) {
    account.status = status;
  }
}

window.addEventListener('hashchange', () => {
  currentRoute = getRouteFromHash();
  const hasCachedData =
    (currentRoute === 'list' && listDataLoaded) ||
    (currentRoute === 'redeem' && redeemAccountsLoaded) ||
    (currentRoute === 'redeem-codes' && redeemCodesDataLoaded) ||
    (currentRoute === 'groups' && groupsDataLoaded) ||
    (currentRoute === 'visitors' && visitorsDataLoaded) ||
    (currentRoute === 'users' && usersDataLoaded) ||
    currentRoute === 'home' ||
    currentRoute === 'create';
  void render({ refreshData: !hasCachedData });
});

currentRoute = getRouteFromHash();

async function bootstrap() {
  try {
    const status = await api('/api/auth/status');
    authChecked = true;
    isAuthenticated = Boolean(status.authenticated);
    authUsername = status.username || '';
    authRole = status.role || '';
    allowRegistration = Boolean(status.allowRegistration);
  } catch {
    authChecked = true;
    isAuthenticated = false;
    authUsername = '';
    authRole = '';
    allowRegistration = false;
  }

  if (isAuthenticated) {
    ensureEventSource();
    ensureImportEventSource();
  }

  await render();
}

void bootstrap();
