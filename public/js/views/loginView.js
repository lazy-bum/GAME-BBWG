import { escapeHtml } from '../html.js';

export function renderLoginPage({ authError, allowRegistration }) {
  const title = allowRegistration ? '初始化系统管理员' : '登录系统';
  const lead = allowRegistration ? '系统尚未创建任何用户，请先注册第一个管理员账号。' : '请输入系统用户账号和密码。';
  const actionText = allowRegistration ? '注册并进入系统' : '登录';

  return `
    <main class="shell auth-page">
      <section class="frame">
        <section class="hero">
          <div class="hero-panel auth-panel">
            <div>
              <h1 class="auth-title">${title}</h1>
              <p class="lead">${lead}</p>
            </div>
            <input id="login-username" class="search-input auth-input" type="text" placeholder="用户名" />
            <input id="login-password" class="search-input auth-input" type="password" placeholder="密码" />
            <button class="primary-button" id="login-button">${actionText}</button>
            <div id="login-feedback" class="feedback" data-state="error" ${authError ? '' : 'hidden'}>${escapeHtml(authError)}</div>
          </div>
        </section>
      </section>
    </main>
  `;
}
