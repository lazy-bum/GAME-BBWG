import { escapeHtml } from '../html.js';

function getRoleText(role) {
  return role === 'admin' ? '管理员' : role === 'user' ? '普通用户' : '';
}

export function createShell(content, { currentRoute, authUsername, authRole, pageClass = '' }) {
  const showHomeActions = currentRoute === 'home';
  const roleText = getRoleText(authRole);
  return `
    <main class="shell ${pageClass}">
      <section class="frame">
        <header class="topbar">
          <button class="back-link" data-route="home" ${currentRoute === 'home' ? 'hidden' : ''}>返回首页</button>
          ${
            showHomeActions
              ? `
          <div class="topbar-actions">
            <span class="user-chip">${escapeHtml(authUsername)}${roleText ? ` · ${escapeHtml(roleText)}` : ''}</span>
            <button class="secondary-button" id="logout-button">退出登录</button>
          </div>
          `
              : ''
          }
        </header>
        ${content}
      </section>
      <div class="avatar-lightbox" id="avatar-lightbox" hidden>
        <img class="avatar-lightbox-image" id="avatar-lightbox-image" alt="头像预览" />
      </div>
    </main>
  `;
}
