export function renderHomePage(shell, { isAdmin }) {
  return shell(
    `
    <section class="hero">
      <div class="hero-panel home-hero-panel">
        <div class="home-card-grid">
          <button class="nav-card home-nav-card" data-route="create">
            <span class="home-card-glow"></span>
            <span class="home-card-label">新增账号</span>
            <span class="home-card-meta">批量导入并自动拉取资料</span>
          </button>
          <button class="nav-card home-nav-card" data-route="list">
            <span class="home-card-glow"></span>
            <span class="home-card-label">账号列表</span>
            <span class="home-card-meta">检索现有账号与角色信息</span>
          </button>
          <button class="nav-card home-nav-card" data-route="redeem">
            <span class="home-card-glow"></span>
            <span class="home-card-label">批量兑换</span>
            <span class="home-card-meta">实时查看兑换状态与结果</span>
          </button>
          ${
            isAdmin
              ? `
          <button class="nav-card home-nav-card" data-route="redeem-codes">
            <span class="home-card-glow"></span>
            <span class="home-card-label">兑换码管理</span>
            <span class="home-card-meta">录入兑换码并配置有效期与等级限制</span>
          </button>
          <button class="nav-card home-nav-card" data-route="groups">
            <span class="home-card-glow"></span>
            <span class="home-card-label">分组管理</span>
            <span class="home-card-meta">配置兑换分组与优先级</span>
          </button>
          <button class="nav-card home-nav-card" data-route="visitors">
            <span class="home-card-glow"></span>
            <span class="home-card-label">访问记录</span>
            <span class="home-card-meta">查看访客日志并维护拦截黑名单</span>
          </button>
          `
              : ''
          }
        </div>
      </div>
    </section>
  `,
    'home-page'
  );
}
