import { escapeHtml } from '../html.js';

export function createShell(content, { currentRoute, authUsername, pageClass = '' }) {
  const showHomeActions = currentRoute === 'home';
  return `
    <main class="shell ${pageClass}">
      <section class="frame">
        <header class="topbar">
          <button class="back-link" data-route="home" ${currentRoute === 'home' ? 'hidden' : ''}>返回首页</button>
          ${
            showHomeActions
              ? `
          <div class="topbar-actions">
            <span class="user-chip">${escapeHtml(authUsername)}</span>
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
