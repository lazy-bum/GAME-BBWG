import { escapeHtml } from '../html.js';

export function renderLoginPage({ authError }) {
  return `
    <main class="shell auth-page">
      <section class="frame">
        <section class="hero">
          <div class="hero-panel auth-panel">
            <div>
              <p class="lead">请输入后端配置的账号和密码。</p>
            </div>
            <input id="login-username" class="search-input auth-input" type="text" placeholder="账号" />
            <input id="login-password" class="search-input auth-input" type="password" placeholder="密码" />
            <button class="primary-button" id="login-button">登录</button>
            <div id="login-feedback" class="feedback" data-state="error" ${authError ? '' : 'hidden'}>${escapeHtml(authError)}</div>
          </div>
        </section>
      </section>
    </main>
  `;
}
