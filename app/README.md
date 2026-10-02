# XX大学站群系统（campus-portal）

高校官网站群系统 —— 主站 + 3 个院系子站、六态内容审核流、RBAC 权限、全站搜索、中英双语与无障碍，6 周作品集项目。

## 启动（第 0 步 + 三步）

**前置要求**：Node `^20.19 || ^22.12 || >=24.0`、pnpm `>=12.8.1`。

**第 0 步 · 准备环境变量**

```bash
cp .env.example .env
```

至少填 `AUTH_SECRET`（生成：`npx auth secret`）；字段清单见 [`../docs/环境变量.txt`](../docs/环境变量.txt)。

**第 1 步 · 安装依赖**

```bash
pnpm install
```

**第 2 步 · 初始化数据库**

```bash
pnpm db:setup   # = prisma migrate dev && prisma db seed（不含 install）
```

**第 3 步 · 启动开发服务器**

```bash
pnpm dev        # http://localhost:3000
```

打开 <http://localhost:3000> 会 302 到 `/main`（主站首页）；后台入口 <http://localhost:3000/admin>。

> 重复开发时不必再跑 `db:setup`：改 schema 用 `pnpm db:migrate`，重置数据用 `pnpm db:reset && pnpm db:seed`。

## 演示账号

| 角色 | 用户名 | 密码 | 权限范围 |
|---|---|---|---|
| 超级管理员 | `admin` | `admin123` | 全部 |
| 站点管理员 | `site_admin` | `admin123` | 本站（main） |
| 栏目编辑 | `editor` | `admin123` | 本栏目 / 本人稿件 |
| 审核员 | `auditor` | `admin123` | 审核（本站） |

- 登录入口：`/admin/login`；密码在 seed 中以 **bcrypt（rounds=10）** 存储。
- 2 分钟演示动线（浏览 → 搜索/双语 → 无障碍 → 后台"编辑提交 → 审核发布" → 统计）见 [`../docs/07-演示账号与链路.md`](../docs/07-演示账号与链路.md)。
- 另有 7 个扩展账号用于填充数据（共 11 个），完整表见 [`../docs/13-数据模型-v2.md`](../docs/13-数据模型-v2.md) §6.1。

## 技术栈

版本以 [`../docs/12-技术栈冻结.md`](../docs/12-技术栈冻结.md) 为准（依赖版本由 `pnpm add` 解析、lockfile 锁定）。

| 层 | 选型 | 版本 |
|---|---|---|
| 框架 | Next.js（App Router + Turbopack） | 16.3.8 |
| UI | React / Tailwind CSS v4 / shadcn-ui | 19.2.8 / 4.3.3 / 4.21.0 |
| 数据 | Prisma（本地 SQLite / 生产 Supabase PostgreSQL） | 7.10.0 |
| 认证 | Auth.js v5（Credentials + JWT 会话） | 5.0.0-beta.32 |
| 多语言 | next-intl（`as-needed`：zh 无前缀、en 带 `/en`） | 4.14.8 |
| 表单与校验 | react-hook-form + zod + @hookform/resolvers | 7.89.0 / 4.6.5 / 5.9.1 |
| 富文本 / 图表 / 搜索 | Tiptap / Recharts / Fuse.js | 3.31.4 / 3.8.0 / 7.5.0 |
| 测试 | Vitest / Playwright | 5.0.3 / 1.63.0 |

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 开发 / 生产构建 / 生产启动 |
| `pnpm lint` / `pnpm typecheck` | ESLint / `next typegen && tsc --noEmit` |
| `pnpm db:setup` | `db:migrate` + `db:seed`（首次初始化） |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` | 迁移 / 幂等种子（可重复执行）/ 重置 |
| `pnpm test` / `pnpm test:watch` / `pnpm test:e2e` | Vitest / 监听 / Playwright（T1.9 落地） |
| `pnpm format` | Prettier 格式化 |

## 项目结构

```text
app/
├── src/proxy.ts                  # 根级拦截：locale 协商 + /admin/* 会话存在性检查
├── src/i18n/                     # routing.ts / request.ts / navigation.ts + messages/{zh,en}.json
├── src/app/
│   ├── (site)/[locale]/[site]/   # 前台 21 条路由（首页/新闻/公告/单页/栏目四分支/搜索/站点地图）
│   ├── admin/                    # 后台 16 条路由（不走 locale，全部 SSR）
│   ├── api/auth/[...nextauth]/   # Auth.js Route Handler
│   ├── sitemap.ts / robots.ts    # MetadataRoute → /sitemap.xml、/robots.txt
│   ├── layout.tsx                # 根布局（html lang、字体、主题 token、无障碍内联脚本）
│   └── error.tsx / not-found.tsx # 全局错误边界与 404
├── prisma/schema.prisma          # 24 个 model（规格见 docs/13）
├── prisma/seed.ts                # 幂等 seed（21 个 seedXxx，全部 upsert）
└── tests/                        # Vitest 用例目录（T1.9 落地）
```

## 已知限制

- **Auth.js v5 仍为 beta**（`5.0.0-beta.32`，官方长期无 stable 版本）→ 升级前必须回归登录与权限链路。
- **构建期依赖外网**：根布局用 `next/font/google` 取 Geist，若 Turbopack 抓取 `fonts.gstatic.com` 超时，`pnpm build` 会**直接失败**（离线环境/CI 需注意；计划第 6 周改为 `next/font/local` 自托管）。
- **本地库是 SQLite 单文件**（`prisma/dev.db`）；切生产 PostgreSQL 需改 `schema.prisma` 的 `datasource.provider` 并重跑迁移。
- 渲染策略：前台内容页走 **ISR**（`revalidate` 300/3600），搜索页 SSR，后台全部 **SSR**。
- 后台页面的数据接入为骨架占位（Server Action 于后续批次落地），当前展示占位文案。

## 明确不做（[`../docs/03-功能范围.txt`](../docs/03-功能范围.txt) §明确不做，A27）

人才招聘与在线投递 · 四套人才培养页面 · 录取查询/依申请公开流转/留言进度查询 · 一卡通/教务/图书馆真实对接 · 短信/支付/SSO · 图片相册/视频播放器/360° VR · RSS/邮件订阅 · 微信小程序/公众号 · 数据看板 · 备份恢复/缓存管理/CDN 刷新/IP 黑白名单/敏感词库/水印 · 埋点采集 · 等保测评/ICP 备案/内容迁移/培训/运维月报。
**以上均不实现，导航与文档中也不出现。**

## 文档索引（`../docs/`）

| 文档 | 内容 |
|---|---|
| [`00-项目状态.md`](../docs/00-项目状态.md) | 总进度、环境限制、§8 规格矛盾清单（**建议先读**） |
| [`07-演示账号与链路.md`](../docs/07-演示账号与链路/07-演示账号与链路.md) | 演示账号、2 分钟演示动线 |
| [`11-裁决记录.md`](../docs/11-裁决记录.md) | A1~A40 裁决记录（**权威**） |
| [`12-技术栈冻结.md`](../docs/12-技术栈冻结.md) | 技术栈与版本冻结、工程化地基、启动顺序约定 |
| [`13-数据模型-v2.md`](../docs/13-数据模型-v2.md) | 24 model 规格 + 种子数据映射表 |
| [`14-API契约.md`](../docs/14-API契约.md) | Server Action / Route Handler 边界、权限码清单 |
| [`15-路由规格.md`](../docs/15-路由规格.md) | 路由树、locale 规则、保留 slug、`proxy.ts` 职责 |
| [`16-测试与验收规格.md`](../docs/16-测试与验收规格.md) | 测试分层与用例目录、各任务 DoD |
| [`17-批次B命令序列.md`](../docs/17-批次B命令序列.md) | 依赖安装与实测命令序列 |
