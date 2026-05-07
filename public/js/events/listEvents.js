export function bindListEvents({
  api,
  render,
  isAdmin,
  getCurrentRoute,
  getFilters,
  setFilters,
  getSelectedAccountIds,
  setSelectedAccountIds,
  setAccountBlacklistModalOpen,
  getAccountGroupFilter,
  setAccountGroupFilter,
  getListAccountsCache,
  setListAccountsCache,
  isNamePopupDismissBound,
  markNamePopupDismissBound
}) {
  const deleteAllButton = document.querySelector('#delete-all-accounts');
  deleteAllButton?.addEventListener('click', async () => {
    if (!window.confirm('确定要删除全部账号吗？此操作不可恢复。')) {
      return;
    }
    deleteAllButton.disabled = true;
    try {
      await api('/api/accounts', { method: 'DELETE' });
      void render();
    } finally {
      deleteAllButton.disabled = false;
    }
  });

  document.querySelector('#view-account-blacklist')?.addEventListener('click', () => {
    setAccountBlacklistModalOpen(true);
    void render();
  });

  const accountBlacklistModal = document.querySelector('#account-blacklist-modal');
  accountBlacklistModal?.addEventListener('click', (event) => {
    if (event.target !== accountBlacklistModal) {
      return;
    }
    setAccountBlacklistModalOpen(false);
    void render();
  });

  document.querySelector('#close-account-blacklist')?.addEventListener('click', () => {
    setAccountBlacklistModalOpen(false);
    void render();
  });

  document.querySelector('#apply-search')?.addEventListener('click', () => {
    const accountIdInput = document.querySelector('#search-account-id');
    const gameNameInput = document.querySelector('#search-game-name');
    setFilters({
      accountIdFilter: accountIdInput?.value ?? '',
      gameNameFilter: gameNameInput?.value ?? ''
    });
    void render();
  });

  document.querySelector('#clear-search')?.addEventListener('click', () => {
    setFilters({
      accountIdFilter: '',
      gameNameFilter: ''
    });
    void render();
  });

  document.querySelectorAll('[data-account-group-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextFilter = button.dataset.accountGroupTab;
      if (!nextFilter || nextFilter === getAccountGroupFilter()) {
        return;
      }
      setAccountGroupFilter(nextFilter);
      setSelectedAccountIds(new Set());
      void render();
    });
  });

  const selectVisibleAccounts = document.querySelector('#select-visible-accounts');
  selectVisibleAccounts?.addEventListener('change', () => {
    const selectedAccountIds = new Set(getSelectedAccountIds());
    const visibleAccountIds = Array.from(document.querySelectorAll('[data-select-account]')).map(
      (item) => item.dataset.selectAccount ?? ''
    );
    if (selectVisibleAccounts.checked) {
      for (const accountId of visibleAccountIds) {
        if (accountId) {
          selectedAccountIds.add(accountId);
        }
      }
    } else {
      for (const accountId of visibleAccountIds) {
        selectedAccountIds.delete(accountId);
      }
    }
    setSelectedAccountIds(selectedAccountIds);
    void render();
  });

  document.querySelectorAll('[data-select-account]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const accountId = checkbox.dataset.selectAccount;
      if (!accountId) {
        return;
      }
      const selectedAccountIds = new Set(getSelectedAccountIds());
      if (checkbox.checked) {
        selectedAccountIds.add(accountId);
      } else {
        selectedAccountIds.delete(accountId);
      }
      setSelectedAccountIds(selectedAccountIds);
      void render();
    });
  });

  const applyAccountGroupButton = document.querySelector('#apply-account-group');
  applyAccountGroupButton?.addEventListener('click', async () => {
    const groupSelect = document.querySelector('#batch-account-group');
    const accountIds = [...getSelectedAccountIds()];
    if (accountIds.length === 0) {
      return;
    }

    applyAccountGroupButton.disabled = true;
    try {
      await api('/api/accounts/group', {
        method: 'POST',
        body: JSON.stringify({ accountIds, groupId: groupSelect?.value ?? '' })
      });
      setSelectedAccountIds(new Set());
      void render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '批量分组失败');
      applyAccountGroupButton.disabled = false;
    }
  });

  bindNamePopupEvents({ isNamePopupDismissBound, markNamePopupDismissBound });
  bindReorderEvents({
    api,
    render,
    isAdmin,
    getCurrentRoute,
    getFilters,
    getListAccountsCache,
    setListAccountsCache
  });

  document.querySelectorAll('[data-delete-account]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accountId = button.dataset.deleteAccount;
      if (!accountId) {
        return;
      }
      button.disabled = true;
      try {
        await api(`/api/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
        await render();
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-blacklist-account]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accountId = button.dataset.blacklistAccount;
      if (!accountId) {
        return;
      }
      if (!window.confirm('确定将该账号加入黑名单吗？加入后不会出现在兑换列表，也不会参与兑换操作。')) {
        return;
      }

      button.disabled = true;
      try {
        await api(`/api/accounts/${encodeURIComponent(accountId)}/blacklist`, { method: 'POST' });
        setAccountBlacklistModalOpen(false);
        await render();
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-unblacklist-account]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accountId = button.dataset.unblacklistAccount;
      if (!accountId) {
        return;
      }

      button.disabled = true;
      try {
        await api(`/api/accounts/${encodeURIComponent(accountId)}/blacklist`, { method: 'DELETE' });
        setAccountBlacklistModalOpen(true);
        await render();
      } finally {
        button.disabled = false;
      }
    });
  });
}

function bindNamePopupEvents({ isNamePopupDismissBound, markNamePopupDismissBound }) {
  const namePopup = document.querySelector('#name-popup');
  const tablePanel = document.querySelector('.table-panel');
  document.querySelectorAll('[data-full-game-name]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!namePopup || !tablePanel) {
        return;
      }

      const fullName = button.dataset.fullGameName ?? '';
      const wasHidden = namePopup.hidden;
      const isSameName = namePopup.textContent === fullName;
      const buttonRect = button.getBoundingClientRect();
      const panelRect = tablePanel.getBoundingClientRect();

      namePopup.textContent = fullName;
      namePopup.style.left = `${buttonRect.left - panelRect.left + buttonRect.width / 2}px`;
      namePopup.style.top = `${buttonRect.top - panelRect.top - 10}px`;
      namePopup.hidden = isSameName ? !wasHidden : false;
    });
  });

  if (!isNamePopupDismissBound()) {
    document.addEventListener('click', () => {
      const currentPopup = document.querySelector('#name-popup');
      if (currentPopup) {
        currentPopup.hidden = true;
      }
    });
    markNamePopupDismissBound();
  }
}

function bindReorderEvents({ api, render, isAdmin, getCurrentRoute, getFilters, getListAccountsCache, setListAccountsCache }) {
  const { accountIdFilter, gameNameFilter } = getFilters();
  const reorderEnabled = isAdmin() && getCurrentRoute() === 'list' && accountIdFilter.trim() === '' && gameNameFilter.trim() === '';
  if (!reorderEnabled) {
    return;
  }

  let draggedAccountId = '';
  let touchDraggedAccountId = '';
  let touchDragChanged = false;
  let touchDragTimer = null;
  let touchDragReady = false;

  document.querySelectorAll('[data-sort-trigger]').forEach((trigger) => {
    trigger.addEventListener('mousedown', () => {
      const row = trigger.closest('[data-sort-account-id]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      row.dataset.dragArmed = 'true';
      row.draggable = true;
    });

    trigger.addEventListener(
      'touchstart',
      () => {
        const row = trigger.closest('[data-sort-account-id]');
        if (!(row instanceof HTMLElement)) {
          return;
        }

        if (touchDragTimer) {
          clearTimeout(touchDragTimer);
        }

        touchDraggedAccountId = row.dataset.sortAccountId ?? '';
        touchDragChanged = false;
        touchDragReady = false;
        row.classList.add('touch-drag-armed');
        touchDragTimer = setTimeout(() => {
          touchDragReady = true;
          row.classList.remove('touch-drag-armed');
          row.classList.add('is-dragging');
        }, 1000);
      },
      { passive: true }
    );
  });

  document.querySelectorAll('[data-sort-account-id]').forEach((row) => {
    row.addEventListener('dragstart', (event) => {
      if (row.dataset.dragArmed !== 'true') {
        event.preventDefault();
        row.draggable = false;
        return;
      }
      draggedAccountId = row.dataset.sortAccountId ?? '';
      row.classList.add('is-dragging');
    });

    row.addEventListener('dragend', () => {
      draggedAccountId = '';
      row.dataset.dragArmed = '';
      row.draggable = false;
      row.classList.remove('is-dragging');
      document.querySelectorAll('[data-sort-account-id]').forEach((item) => {
        item.classList.remove('drag-over');
      });
    });

    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!draggedAccountId || draggedAccountId === row.dataset.sortAccountId) {
        return;
      }
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      row.classList.remove('drag-over');

      const targetAccountId = row.dataset.sortAccountId ?? '';
      if (!draggedAccountId || !targetAccountId || draggedAccountId === targetAccountId) {
        return;
      }

      const nextOrder = [...getListAccountsCache()];
      const draggedIndex = nextOrder.findIndex((item) => item.accountId === draggedAccountId);
      const targetIndex = nextOrder.findIndex((item) => item.accountId === targetAccountId);
      if (draggedIndex === -1 || targetIndex === -1) {
        return;
      }

      const [draggedAccount] = nextOrder.splice(draggedIndex, 1);
      nextOrder.splice(targetIndex, 0, draggedAccount);
      setListAccountsCache(nextOrder);

      try {
        await api('/api/accounts/reorder', {
          method: 'POST',
          body: JSON.stringify({ accountIds: nextOrder.map((item) => item.accountId) })
        });
        void render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '排序保存失败');
        void render();
      }
    });

    row.addEventListener(
      'touchmove',
      (event) => {
        if (!touchDraggedAccountId) {
          return;
        }

        const touch = event.touches[0];
        if (!touch || !touchDragReady) {
          return;
        }

        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-sort-account-id]');
        if (!target || target === row || !(target instanceof HTMLElement)) {
          return;
        }

        event.preventDefault();
        touchDragChanged = true;
        const parent = row.parentElement;
        if (!parent) {
          return;
        }

        const targetRect = target.getBoundingClientRect();
        const shouldInsertAfter = touch.clientY > targetRect.top + targetRect.height / 2;
        target.classList.add('drag-over');

        if (shouldInsertAfter) {
          parent.insertBefore(row, target.nextElementSibling);
        } else {
          parent.insertBefore(row, target);
        }
      },
      { passive: false }
    );

    row.addEventListener('touchend', async () => {
      if (touchDragTimer) {
        clearTimeout(touchDragTimer);
        touchDragTimer = null;
      }

      row.classList.remove('touch-drag-armed');
      row.classList.remove('is-dragging');
      document.querySelectorAll('[data-sort-account-id]').forEach((item) => {
        item.classList.remove('drag-over');
      });

      if (!touchDraggedAccountId || !touchDragReady) {
        touchDraggedAccountId = '';
        touchDragChanged = false;
        touchDragReady = false;
        row.dataset.dragArmed = '';
        return;
      }

      const nextOrderIds = Array.from(document.querySelectorAll('[data-sort-account-id]')).map(
        (item) => item.dataset.sortAccountId ?? ''
      );
      const currentOrderIds = getListAccountsCache().map((item) => item.accountId);
      const changed =
        touchDragChanged &&
        nextOrderIds.length === currentOrderIds.length &&
        nextOrderIds.some((item, index) => item !== currentOrderIds[index]);

      touchDraggedAccountId = '';
      touchDragChanged = false;
      touchDragReady = false;
      row.dataset.dragArmed = '';

      if (!changed) {
        return;
      }

      const cacheMap = new Map(getListAccountsCache().map((item) => [item.accountId, item]));
      setListAccountsCache(nextOrderIds.map((accountId) => cacheMap.get(accountId)).filter(Boolean));

      try {
        await api('/api/accounts/reorder', {
          method: 'POST',
          body: JSON.stringify({ accountIds: nextOrderIds })
        });
        void render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '排序保存失败');
        void render();
      }
    });

    row.addEventListener('touchcancel', () => {
      if (touchDragTimer) {
        clearTimeout(touchDragTimer);
        touchDragTimer = null;
      }

      touchDraggedAccountId = '';
      touchDragChanged = false;
      touchDragReady = false;
      row.dataset.dragArmed = '';
      row.classList.remove('touch-drag-armed');
      row.classList.remove('is-dragging');
      document.querySelectorAll('[data-sort-account-id]').forEach((item) => {
        item.classList.remove('drag-over');
      });
      void render();
    });

    row.addEventListener('mouseup', () => {
      row.dataset.dragArmed = '';
      row.draggable = false;
    });

    row.addEventListener('mouseleave', () => {
      if (!draggedAccountId) {
        row.dataset.dragArmed = '';
        row.draggable = false;
      }
    });
  });
}
