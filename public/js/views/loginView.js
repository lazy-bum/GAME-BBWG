import { escapeHtml } from '../html.js';

export function renderLoginPage({ authError, allowRegistration }) {
  const title = allowRegistration ? '初始化或登录系统' : '登录或注册系统';
  const lead = allowRegistration
    ? '系统尚未创建任何用户。首次注册的账号会自动成为管理员，后续用户也可以自行注册普通账号。'
    : '请输入系统用户账号和密码；如果还没有账号，也可以直接注册普通用户。';
  const registerText = allowRegistration ? '注册首个管理员并进入系统' : '注册并进入系统';

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
            <div class="page-actions auth-actions">
              <button class="primary-button" id="login-button">登录</button>
              <button class="secondary-button" id="register-button">${registerText}</button>
            </div>
            <div id="login-feedback" class="feedback" data-state="error" ${authError ? '' : 'hidden'}>${escapeHtml(authError)}</div>
          </div>
        </section>
      </section>
    </main>
  `;
}
