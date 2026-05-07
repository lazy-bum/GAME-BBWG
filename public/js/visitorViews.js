import { escapeAttribute, escapeHtml, formatDateTime } from './html.js';

export function renderVisitorLogRow(item, visitorBlacklist) {
  const requestLabel = `${item.method} ${item.path}`;
  const accountLabel = item.username ? `${item.username} (${item.userRole || '-'})` : '-';
  const sourceLabel = [item.host, item.cfCountry].filter(Boolean).join(' / ') || '-';
  const queryLabel = item.query || '-';
  const bodyLabel = item.body || '-';
  const isBlacklisted = visitorBlacklist.some((entry) => entry.ipAddress === item.ipAddress);
  const details = [
    item.params ? `Params:\n${item.params}` : '',
    item.headers ? `Headers:\n${item.headers}` : '',
    item.blocked ? `Blocked:\n${item.blockReason || '是'}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  return `
    <tr>
      <td data-label="时间">${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td data-label="IP">
        <div class="visitor-ip-cell">
          <span class="mono-text">${escapeHtml(item.ipAddress || '-')}</span>
          <span class="visitor-user-agent">${escapeHtml(item.userAgent || '-')}</span>
        </div>
      </td>
      <td data-label="请求">
        <div class="visitor-request-cell">
          <span class="mono-text">${escapeHtml(item.method)}</span>
          <span class="visitor-request-meta">${escapeHtml(item.protocol.toUpperCase())} · ${escapeHtml(String(item.durationMs))}ms</span>
        </div>
      </td>
      <td data-label="路径"><span class="mono-text visitor-path-text">${escapeHtml(item.path || requestLabel)}</span></td>
      <td data-label="参数"><pre class="visitor-inline-pre">${escapeHtml(queryLabel)}</pre></td>
      <td data-label="Body"><pre class="visitor-inline-pre">${escapeHtml(bodyLabel)}</pre></td>
      <td data-label="状态">
        <span class="status-badge ${item.blocked ? 'status-blocked' : item.statusCode >= 400 ? 'status-2' : 'status-1'}">${escapeHtml(
          item.blocked ? `拦截 ${item.statusCode}` : String(item.statusCode)
        )}</span>
      </td>
      <td data-label="来源">${escapeHtml(sourceLabel)}</td>
      <td data-label="账号">${escapeHtml(accountLabel)}</td>
      <td data-label="详情">
        <details class="visitor-details">
          <summary>查看</summary>
          <pre>${escapeHtml(details || '无更多详情')}</pre>
        </details>
      </td>
      <td data-label="操作">
        ${
          item.ipAddress && !isBlacklisted
            ? `<button class="danger-button" data-block-ip="${escapeAttribute(item.ipAddress)}">拉黑</button>`
            : `<span class="visitor-action-placeholder">${isBlacklisted ? '已拉黑' : '-'}</span>`
        }
      </td>
    </tr>
  `;
}

export function renderVisitorBlacklistRow(item) {
  return `
    <tr>
      <td data-label="IP"><span class="mono-text">${escapeHtml(item.ipAddress)}</span></td>
      <td data-label="原因">${escapeHtml(item.reason || '-')}</td>
      <td data-label="更新时间">${escapeHtml(formatDateTime(item.updatedAt))}</td>
      <td data-label="操作">
        <button class="secondary-button" data-unblock-ip="${escapeAttribute(item.ipAddress)}">移除黑名单</button>
      </td>
    </tr>
  `;
}
