import { VISITOR_LOG_BATCH_SIZE } from '../constants.js';
import { escapeAttribute, escapeHtml } from '../html.js';
import { renderVisitorBlacklistRow, renderVisitorLogRow } from '../visitorViews.js';

export function renderVisitorPage(shell, state) {
  const filteredVisitorLogs = state.visitorLogs.filter((item) =>
    state.visitorPathFilter.trim() === '' ? true : (item.path || '').toLowerCase().includes(state.visitorPathFilter.trim().toLowerCase())
  );
  const visibleVisitorLogs = filteredVisitorLogs.slice(0, state.visitorVisibleCount);
  const hasMoreVisitorLogs = visibleVisitorLogs.length < filteredVisitorLogs.length;
  const blockModal = `
    <div class="visitor-modal-backdrop" id="visitor-block-modal" ${state.visitorBlockTargetIp ? '' : 'hidden'}>
      <div class="visitor-modal" role="dialog" aria-modal="true" aria-labelledby="visitor-block-title">
        <div class="visitor-modal-head">
          <h3 id="visitor-block-title">拉黑 IP</h3>
        </div>
        <div class="visitor-modal-body">
          <div class="feedback" data-state="error">IP：${escapeHtml(state.visitorBlockTargetIp || '-')}</div>
          <input
            id="visitor-block-reason"
            class="search-input visitor-block-reason-input"
            type="text"
            placeholder="输入拉黑理由，例如恶意扫描"
          />
        </div>
        <div class="visitor-modal-actions">
          <button class="danger-button" id="confirm-visitor-block">确认拉黑</button>
          <button class="secondary-button" id="cancel-visitor-block">取消</button>
        </div>
      </div>
    </div>
  `;
  const logRows =
    state.visitorLogs.length === 0
      ? '<div class="empty-state">最近还没有访问记录。</div>'
      : filteredVisitorLogs.length === 0
        ? '<div class="empty-state">没有匹配到对应路径的访问记录。</div>'
      : `
      <div class="table-wrap visitor-log-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>IP</th>
              <th>请求</th>
              <th>路径</th>
              <th>参数</th>
              <th>Body</th>
              <th>状态</th>
              <th>来源</th>
              <th>账号</th>
              <th>详情</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${visibleVisitorLogs.map((item) => renderVisitorLogRow(item, state.visitorBlacklist)).join('')}</tbody>
        </table>
      </div>
      ${
        hasMoreVisitorLogs
          ? `<div class="visitor-load-more" id="visitor-log-load-more">继续下滑加载更多记录</div>`
          : `<div class="visitor-load-more visitor-load-more-end">已显示全部 ${filteredVisitorLogs.length} 条记录</div>`
      }
    `;
  const blacklistRows =
    state.visitorBlacklist.length === 0
      ? '<div class="empty-state blacklist-empty">当前没有黑名单 IP。</div>'
      : `
      <div class="table-wrap blacklist-wrap">
        <table>
          <thead>
            <tr>
              <th>IP</th>
              <th>原因</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${state.visitorBlacklist.map(renderVisitorBlacklistRow).join('')}</tbody>
        </table>
      </div>
    `;

  return shell(`
    <section class="page-head">
      <div>
        <p class="lead">当前拉取最近 ${state.visitorLogLimit} 条访问记录，每次展示 ${VISITOR_LOG_BATCH_SIZE} 条，下滑自动继续加载。数据库会自动只保留最近 ${state.visitorLogRetentionDays} 天。</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" id="refresh-visitor-logs">刷新访问记录</button>
        <button class="danger-button" id="clear-visitor-logs">一键清空访问记录</button>
      </div>
    </section>
    <section class="panel visitor-panel">
      <div class="visitor-toolbar">
        <input id="visitor-path-filter" class="search-input visitor-path-filter-input" type="text" placeholder="按访问路径搜索，例如 /api/auth" value="${escapeAttribute(state.visitorPathFilter)}" />
        <button class="secondary-button toolbar-button" id="clear-visitor-path-filter">清空路径搜索</button>
      </div>
    </section>
    <section class="panel visitor-panel">
      <div class="visitor-toolbar">
        <input id="blacklist-ip" class="search-input" type="text" placeholder="输入 IP 地址加入黑名单" />
        <input id="blacklist-reason" class="search-input visitor-reason-input" type="text" placeholder="拉黑原因，例如恶意扫描" />
        <button class="danger-button toolbar-button" id="add-blacklist-entry">加入黑名单</button>
      </div>
      ${blacklistRows}
    </section>
    <section class="panel visitor-panel">
      ${logRows}
    </section>
    ${blockModal}
  `);
}
