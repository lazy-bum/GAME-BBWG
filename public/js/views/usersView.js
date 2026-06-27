import { escapeHtml, formatDateTime } from '../html.js';

function renderRoleBadge(role) {
  const isAdmin = role === 'admin';
  return `<span class="role-badge ${isAdmin ? 'is-admin' : 'is-user'}">${isAdmin ? '管理员' : '普通用户'}</span>`;
}

export function renderUsersPage(shell, state) {
  const rows =
    state.users.length === 0
      ? '<div class="empty-state">当前还没有系统用户。</div>'
      : `
        <div class="table-wrap user-table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              ${state.users
                .map(
                  (user) => `
                    <tr>
                      <td data-label="用户名">${escapeHtml(user.username)}</td>
                      <td data-label="角色">${renderRoleBadge(user.role)}</td>
                      <td data-label="创建时间">${escapeHtml(formatDateTime(user.createdAt))}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

  return shell(`
    <section class="page-head">
      <div>
        <p class="lead">系统只区分管理员与普通用户。管理员可新增普通用户，首个注册账号自动成为管理员。</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" id="refresh-users">刷新</button>
      </div>
    </section>
    <section class="panel form-panel users-create-panel">
      <input id="new-user-username" class="search-input group-name-input" type="text" placeholder="普通用户名" />
      <input id="new-user-password" class="search-input group-name-input" type="password" placeholder="登录密码" />
      <button class="primary-button toolbar-button" id="create-user">新增普通用户</button>
      <div id="user-feedback" class="feedback" hidden></div>
    </section>
    <section class="panel table-panel">
      ${rows}
    </section>
  `);
}
