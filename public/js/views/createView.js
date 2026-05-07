import { escapeHtml } from '../html.js';

export function renderCreatePage(shell, state) {
  const progressPercent = state.importTotal > 0 ? Math.round((state.importProcessed / state.importTotal) * 100) : 0;
  const progressSection =
    state.importIsRunning || state.importTotal > 0
      ? `
      <div class="create-progress">
        <div class="redeem-progress-bar"><span style="width: ${progressPercent}%"></span></div>
        <div class="redeem-progress-text">录入进度 ${state.importProcessed} / ${state.importTotal}，成功 ${state.importInserted}，跳过 ${state.importSkipped}，失败 ${state.importFailed}</div>
        ${state.importCurrentAccountId ? `<div class="redeem-progress-text">当前处理：${escapeHtml(state.importCurrentAccountId)}</div>` : ''}
      </div>
    `
      : '';
  return shell(`
    <section class="page-head">
      <div>
        <p class="lead">每行一个，已存在的不会重复写入。</p>
      </div>
    </section>
    <section class="panel form-panel">
      <label class="field-label" for="account-ids">账号列表</label>
      <textarea id="account-ids" class="textarea" placeholder="一行一个ID" ${state.importIsRunning ? 'disabled' : ''}></textarea>
      ${progressSection}
      <div class="actions">
        <button class="primary-button" id="submit-accounts" ${state.importIsRunning ? 'disabled' : ''}>${state.importIsRunning ? '录入中...' : '提交'}</button>
      </div>
      <div id="create-feedback" class="feedback" hidden></div>
    </section>
  `);
}
