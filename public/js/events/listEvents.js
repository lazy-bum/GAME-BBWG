export function bindListEvents({
  api,
  render,
  renderLocal,
  isAdmin,
  getCurrentRoute,
  getFilters,
  setFilters,
  getSelectedAccountIds,
  setSelectedAccountIds,
  setAccountBlacklistModalOpen,
  getAccountMissingRedeemCodesModal,
  setAccountMissingRedeemCodesModal,
  getAccountBackupFeedback,
  setAccountBackupFeedback,
  getAccountGroupFilter,
  setAccountGroupFilter,
  getListAccountsCache,
  setListAccountsCache,
  isNamePopupDismissBound,
  markNamePopupDismissBound
}) {
  document.querySelector('#refresh-accounts')?.addEventListener('click', () => {
    setAccountBackupFeedback(null);
    void render();
  });

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
    document.querySelector('#account-blacklist-modal')?.removeAttribute('hidden');
  });

  const accountBlacklistModal = document.querySelector('#account-blacklist-modal');
  accountBlacklistModal?.addEventListener('click', (event) => {
    if (event.target !== accountBlacklistModal) {
      return;
    }
    setAccountBlacklistModalOpen(false);
    accountBlacklistModal.setAttribute('hidden', '');
  });

  document.querySelector('#close-account-blacklist')?.addEventListener('click', () => {
    setAccountBlacklistModalOpen(false);
    document.querySelector('#account-blacklist-modal')?.setAttribute('hidden', '');
  });

  const accountMissingRedeemModal = document.querySelector('#account-missing-redeem-modal');
  accountMissingRedeemModal?.addEventListener('click', (event) => {
    if (event.target !== accountMissingRedeemModal) {
      return;
    }
    setAccountMissingRedeemCodesModal(null);
    document.querySelector('#account-missing-redeem-modal')?.setAttribute('hidden', '');
  });

  document.querySelector('#close-account-missing-redeem')?.addEventListener('click', () => {
    setAccountMissingRedeemCodesModal(null);
    void renderLocal();
  });

  document.querySelector('#redeem-account-missing-codes')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const currentModal = getAccountMissingRedeemCodesModal();
    const accountId = currentModal?.accountId;
    if (!(button instanceof HTMLButtonElement) || !accountId) {
      return;
    }

    button.disabled = true;
    try {
      const result = await api(`/api/accounts/${encodeURIComponent(accountId)}/redeem-missing-codes`, {
        method: 'POST'
      });
      const processedCodes = result.data?.processedCodes ?? 0;
      window.alert(processedCodes > 0 ? `已开始处理 ${processedCodes} 个兑换码。` : '当前没有可补兑的兑换码。');
      setAccountMissingRedeemCodesModal(null);
      await render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '一键兑换未兑换码失败');
      button.disabled = false;
    }
  });

  document.querySelector('#apply-search')?.addEventListener('click', () => {
    const accountIdInput = document.querySelector('#search-account-id');
    const gameNameInput = document.querySelector('#search-game-name');
    setFilters({
      accountIdFilter: accountIdInput?.value ?? '',
      gameNameFilter: gameNameInput?.value ?? ''
    });
    void renderLocal();
  });

  document.querySelector('#clear-search')?.addEventListener('click', () => {
    setFilters({
      accountIdFilter: '',
      gameNameFilter: ''
    });
    void renderLocal();
  });

  const exportBackupButton = document.querySelector('#export-account-backup');
  exportBackupButton?.addEventListener('click', async () => {
    if (!(exportBackupButton instanceof HTMLButtonElement)) {
      return;
    }

    exportBackupButton.disabled = true;
    setAccountBackupFeedback(null);
    try {
      const response = await fetch('/api/accounts/export', {
        credentials: 'same-origin'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '导出失败');
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const exportedAt = new Date(data.exportedAt || Date.now()).toISOString().slice(0, 19).replaceAll(':', '-');
      link.href = url;
      link.download = `bbwg-accounts-${exportedAt}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setAccountBackupFeedback({
        isError: false,
        message: `导出完成，共 ${Array.isArray(data.accounts) ? data.accounts.length : 0} 个账号。`
      });
      void renderLocal();
    } catch (error) {
      setAccountBackupFeedback({
        isError: true,
        message: error instanceof Error ? error.message : '导出失败'
      });
      void renderLocal();
    } finally {
      exportBackupButton.disabled = false;
    }
  });

  const importBackupButton = document.querySelector('#import-account-backup');
  const importBackupInput = document.querySelector('#account-backup-file');
  importBackupButton?.addEventListener('click', () => {
    setAccountBackupFeedback(null);
    importBackupInput?.click();
  });

  importBackupInput?.addEventListener('change', async () => {
    if (!(importBackupInput instanceof HTMLInputElement) || !importBackupInput.files?.[0]) {
      return;
    }

    const file = importBackupInput.files[0];
    if (!window.confirm(`确定导入备份文件「${file.name}」吗？已存在账号和分组会按备份内容更新。`)) {
      importBackupInput.value = '';
      return;
    }
    if (!(importBackupButton instanceof HTMLButtonElement)) {
      return;
    }

    importBackupButton.disabled = true;
    setAccountBackupFeedback(null);
    try {
      const content = await file.text();
      const payload = JSON.parse(content);
      const result = await api('/api/accounts/import-backup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSelectedAccountIds(new Set());
      setAccountBackupFeedback({
        isError: false,
        message:
          `导入完成，新增 ${result.accountsInserted} 个账号，更新 ${result.accountsUpdated} 个账号，` +
          `新增 ${result.groupsInserted} 个分组，更新 ${result.groupsUpdated} 个分组。`
      });
      await render();
    } catch (error) {
      setAccountBackupFeedback({
        isError: true,
        message: error instanceof Error ? error.message : '导入失败'
      });
      void renderLocal();
    } finally {
      importBackupInput.value = '';
      importBackupButton.disabled = false;
    }
  });

  const selectVisibleAccounts = document.querySelector('#select-visible-accounts');
  selectVisibleAccounts?.addEventListener('change', () => {
    const selectedAccountIds = new Set(getSelectedAccountIds());
    const visibleCheckboxes = Array.from(document.querySelectorAll('[data-select-account]'));
    const visibleAccountIds = visibleCheckboxes.map((item) => item.dataset.selectAccount ?? '');
    for (const checkbox of visibleCheckboxes) {
      checkbox.checked = selectVisibleAccounts.checked;
    }
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
    refreshSelectionUi(selectedAccountIds);
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

  bindDelegatedListEvents({
    api,
    render,
    renderLocal,
    getAccountGroupFilter,
    setAccountGroupFilter,
    getSelectedAccountIds,
    setSelectedAccountIds,
    setAccountBlacklistModalOpen,
    setAccountMissingRedeemCodesModal,
    getAccountBackupFeedback,
    setAccountBackupFeedback,
    isNamePopupDismissBound,
    markNamePopupDismissBound
  });
  bindReorderEvents({
    api,
    render,
    isAdmin,
    getCurrentRoute,
    getFilters,
    getListAccountsCache,
    setListAccountsCache
  });
}

function refreshSelectionUi(selectedAccountIds) {
  const visibleCheckboxes = Array.from(document.querySelectorAll('[data-select-account]'));
  const selectedVisibleCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;
  const selectVisibleAccounts = document.querySelector('#select-visible-accounts');
  if (selectVisibleAccounts) {
    selectVisibleAccounts.checked = visibleCheckboxes.length > 0 && selectedVisibleCount === visibleCheckboxes.length;
    selectVisibleAccounts.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCheckboxes.length;
  }

  const applyAccountGroupButton = document.querySelector('#apply-account-group');
  if (applyAccountGroupButton) {
    applyAccountGroupButton.disabled = selectedAccountIds.size === 0;
    applyAccountGroupButton.textContent = `批量分组 (${selectedAccountIds.size})`;
  }
}

function bindDelegatedListEvents({
  api,
  render,
  renderLocal,
  getAccountGroupFilter,
  setAccountGroupFilter,
  getSelectedAccountIds,
  setSelectedAccountIds,
  setAccountBlacklistModalOpen,
  setAccountMissingRedeemCodesModal,
  setAccountBackupFeedback,
  isNamePopupDismissBound,
  markNamePopupDismissBound
}) {
  const tablePanel = document.querySelector('.table-panel');
  tablePanel?.addEventListener('change', (event) => {
    const checkbox = event.target?.closest?.('[data-select-account]');
    if (!checkbox) {
      return;
    }

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
    refreshSelectionUi(selectedAccountIds);
  });

  tablePanel?.addEventListener('click', async (event) => {
    const groupTab = event.target?.closest?.('[data-account-group-tab]');
    if (groupTab) {
      const nextFilter = groupTab.dataset.accountGroupTab;
      if (!nextFilter || nextFilter === getAccountGroupFilter()) {
        return;
      }
      setAccountGroupFilter(nextFilter);
      setSelectedAccountIds(new Set());
      setAccountBackupFeedback(null);
      void renderLocal();
      return;
    }

    const nameButton = event.target?.closest?.('[data-full-game-name]');
    if (nameButton) {
      event.stopPropagation();
      showNamePopup(nameButton);
      return;
    }

    const missingRedeemButton = event.target?.closest?.('[data-view-account-missing-redeem]');
    if (missingRedeemButton) {
      const accountId = missingRedeemButton.dataset.viewAccountMissingRedeem;
      if (!accountId) {
        return;
      }

      missingRedeemButton.disabled = true;
      try {
        const missingCodes = await api(`/api/accounts/${encodeURIComponent(accountId)}/missing-redeem-codes`);
        setAccountMissingRedeemCodesModal({
          accountId,
          missingCodes: Array.isArray(missingCodes) ? missingCodes : []
        });
        void renderLocal();
      } finally {
        missingRedeemButton.disabled = false;
      }
      return;
    }

    const deleteButton = event.target?.closest?.('[data-delete-account]');
    if (deleteButton) {
      const accountId = deleteButton.dataset.deleteAccount;
      if (!accountId) {
        return;
      }
      deleteButton.disabled = true;
      try {
        await api(`/api/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
        await render();
      } finally {
        deleteButton.disabled = false;
      }
      return;
    }

    const blacklistButton = event.target?.closest?.('[data-blacklist-account]');
    if (blacklistButton) {
      const accountId = blacklistButton.dataset.blacklistAccount;
      if (!accountId) {
        return;
      }
      if (!window.confirm('确定将该账号加入黑名单吗？加入后不会出现在兑换列表，也不会参与兑换操作。')) {
        return;
      }

      blacklistButton.disabled = true;
      try {
        await api(`/api/accounts/${encodeURIComponent(accountId)}/blacklist`, { method: 'POST' });
        setAccountBlacklistModalOpen(false);
        await render();
      } finally {
        blacklistButton.disabled = false;
      }
    }
  });

  const accountBlacklistModal = document.querySelector('#account-blacklist-modal');
  accountBlacklistModal?.addEventListener('click', async (event) => {
    const unblacklistButton = event.target?.closest?.('[data-unblacklist-account]');
    if (!unblacklistButton) {
      return;
    }

    const accountId = unblacklistButton.dataset.unblacklistAccount;
    if (!accountId) {
      return;
    }

    unblacklistButton.disabled = true;
    try {
      await api(`/api/accounts/${encodeURIComponent(accountId)}/blacklist`, { method: 'DELETE' });
      setAccountBlacklistModalOpen(true);
      await render();
    } finally {
      unblacklistButton.disabled = false;
    }
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

function showNamePopup(button) {
  const namePopup = document.querySelector('#name-popup');
  const tablePanel = document.querySelector('.table-panel');
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
