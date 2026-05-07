import { renderAccountGroupRow } from '../accountGroupViews.js';

export function renderGroupsPage(shell, { accountGroups }) {
  const groupRows =
    accountGroups.length === 0
      ? '<div class="empty-state">当前还没有分组。</div>'
      : `
      <div class="table-wrap group-list-wrap">
        <table>
          <thead>
            <tr>
              <th>分组名称</th>
              <th>优先级</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${accountGroups.map(renderAccountGroupRow).join('')}</tbody>
        </table>
      </div>
    `;

  return shell(`
    <section class="page-head">
      <div>
        <p class="lead">兑换时先按分组优先级从高到低，再按分组排序从小到大，最后按账号列表顺序执行。</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" id="refresh-account-groups">刷新</button>
      </div>
    </section>
    <section class="panel form-panel group-create-panel">
      <input id="new-group-name" class="search-input" type="text" placeholder="分组名称" />
      <input id="new-group-priority" class="search-input group-number-input" type="number" placeholder="优先级，越大越先兑换" value="0" />
      <input id="new-group-sort" class="search-input group-number-input" type="number" placeholder="排序，越小越靠前" />
      <button class="primary-button toolbar-button" id="create-account-group">新增分组</button>
      <div id="group-feedback" class="feedback" hidden></div>
    </section>
    <section class="panel table-panel">
      ${groupRows}
    </section>
  `);
}
