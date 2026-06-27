let visitorFilterRenderTimer = null;

export function bindVisitorEvents({
  api,
  render,
  renderLocal,
  reloadVisitorLogs,
  getVisitorBlockTargetIp,
  setVisitorBlockTargetIp,
  setVisitorPathFilter,
  clearVisitorLogs,
  disconnectVisitorLogObserver
}) {
  document.querySelector('#refresh-visitor-logs')?.addEventListener('click', () => {
    void reloadVisitorLogs({ refreshBlacklist: true });
  });

  const clearVisitorLogsButton = document.querySelector('#clear-visitor-logs');
  clearVisitorLogsButton?.addEventListener('click', async () => {
    if (!window.confirm('确定要清空全部访问记录吗？此操作不可恢复。')) {
      return;
    }

    clearVisitorLogsButton.disabled = true;
    try {
      await api('/api/visitor-logs', { method: 'DELETE' });
      clearVisitorLogs();
      disconnectVisitorLogObserver();
      void render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '清空访问记录失败');
      clearVisitorLogsButton.disabled = false;
    }
  });

  const visitorPathFilterInput = document.querySelector('#visitor-path-filter');
  visitorPathFilterInput?.addEventListener('input', () => {
    setVisitorPathFilter(visitorPathFilterInput.value ?? '');
    if (visitorFilterRenderTimer) {
      clearTimeout(visitorFilterRenderTimer);
    }
    visitorFilterRenderTimer = setTimeout(() => {
      visitorFilterRenderTimer = null;
      void reloadVisitorLogs();
    }, 150);
  });

  document.querySelector('#clear-visitor-path-filter')?.addEventListener('click', () => {
    setVisitorPathFilter('');
    if (visitorPathFilterInput) {
      visitorPathFilterInput.value = '';
    }
    void reloadVisitorLogs();
  });

  const addBlacklistEntryButton = document.querySelector('#add-blacklist-entry');
  addBlacklistEntryButton?.addEventListener('click', async () => {
    const ipInput = document.querySelector('#blacklist-ip');
    const reasonInput = document.querySelector('#blacklist-reason');
    const ipAddress = ipInput?.value.trim() ?? '';
    const reason = reasonInput?.value.trim() ?? '';

    if (!ipAddress) {
      window.alert('请输入要拉黑的 IP 地址。');
      return;
    }

    addBlacklistEntryButton.disabled = true;
    try {
      await api('/api/visitor-blacklist', {
        method: 'POST',
        body: JSON.stringify({ ipAddress, reason })
      });
      if (ipInput) {
        ipInput.value = '';
      }
      if (reasonInput) {
        reasonInput.value = '';
      }
      void render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '拉黑失败');
    } finally {
      addBlacklistEntryButton.disabled = false;
    }
  });

  const visitorBlockModal = document.querySelector('#visitor-block-modal');
  visitorBlockModal?.addEventListener('click', (event) => {
    if (event.target === visitorBlockModal) {
      setVisitorBlockTargetIp('');
      void renderLocal();
    }
  });

  document.querySelector('#cancel-visitor-block')?.addEventListener('click', () => {
    setVisitorBlockTargetIp('');
    void renderLocal();
  });

  const confirmVisitorBlockButton = document.querySelector('#confirm-visitor-block');
  confirmVisitorBlockButton?.addEventListener('click', async () => {
    const visitorBlockTargetIp = getVisitorBlockTargetIp();
    if (!visitorBlockTargetIp) {
      return;
    }

    const reasonInput = document.querySelector('#visitor-block-reason');
    const reason = reasonInput?.value.trim() ?? '';
    confirmVisitorBlockButton.disabled = true;
    try {
      await api('/api/visitor-blacklist', {
        method: 'POST',
        body: JSON.stringify({ ipAddress: visitorBlockTargetIp, reason })
      });
      setVisitorBlockTargetIp('');
      void render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '拉黑失败');
      confirmVisitorBlockButton.disabled = false;
    }
  });

  document.querySelectorAll('[data-block-ip]').forEach((button) => {
    button.addEventListener('click', () => {
      const ipAddress = button.dataset.blockIp;
      if (ipAddress) {
        setVisitorBlockTargetIp(ipAddress);
        void renderLocal();
      }
    });
  });

  document.querySelectorAll('[data-unblock-ip]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ipAddress = button.dataset.unblockIp;
      if (!ipAddress) {
        return;
      }

      button.disabled = true;
      try {
        await api(`/api/visitor-blacklist/${encodeURIComponent(ipAddress)}`, {
          method: 'DELETE'
        });
        void render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '解除失败');
      } finally {
        button.disabled = false;
      }
    });
  });
}
