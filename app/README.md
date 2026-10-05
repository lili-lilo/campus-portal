# 明德大学站群系统（campus-portal）

高校官网站群系统 —— **主站 + 3 个院系子站 + 后台 + 审核流 + RBAC + 中英双语 + 无障碍 + 数据可视化**，6 周作品集项目（无甲方、无真实机构）。含 100 篇种子文章、120 个媒体素材、21 张数据表。

> ⚠ **合规声明：本站为技术演示项目（portfolio demo），非真实教育机构。**
> 校名「明德大学（MINGDE UNIVERSITY）」、院系、人物、新闻、数据、地址与联系方式**全部为虚构**，仅用于展示工程能力；不发布真实机构信息，不伪造备案号。

## 亮点（产品视角）

| # | 能力 | 说明 |
|---|---|---|
| 1 | **中英双语（URL 级切换）** | `next-intl` + `as-needed` 策略：中文无前缀 `/main`、英文带 `/en/main`；站点名 / 栏目名 / 导航名走 `*En` 字段，**不是内容机翻** |
| 2 | **无障碍面板** | 字号 5 档 + 高对比度开关，**cookie 持久化 + SSR 首帧即生效（零闪烁）**；`prefers-reduced-motion` 全站降级 |
| 3 | **六态审核流（8 条边）** | `draft → pending_first → pending_final → published`（含 `rejected` / `withdrawn`），每条边带状态机校验 + **强制留痕**（`ArticleVersion` 快照 + `AuditRecord`） |
| 4 | **RBAC 三级鉴权** | **L1** 会话（`proxy.ts` 拦 `/admin/*`）→ **L2** 权限码 `can()` → **L3** 数据范围 `inScope()`（超级管理员全站 / 其余锁本站） |
| 5 | **评论两级** | 前台顶级评论 + 回复（只读展示），后台平铺审核台；公开 `GET /api/comments` |
| 6 | **数据可视化** | Recharts 4 图（趋势 / 来源饼图 / 栏目横条 ×2），落在仪表盘与统计页 |
| 7 | **全站搜索** | Fuse.js 模糊匹配 + 关键词高亮 + 分页；`/api/search` Route Handler |
| 8 | **媒体库** | 上传 / 列表 / 回收站；**`StorageAdapter` 抽象**（本地实现 + 生产可换 Supabase Storage） |
| 9 | **视觉改造（M6）** | 通栏 72vh 沉浸式 Hero（`motion` Ken Burns + 标题入场）、数字看板（滚动计数）、图片化院系卡、深色三层页脚 |
| 10 | **内容自动化** | 幂等 seed（21 个 `seedXxx`，全 `upsert`）+ 图片批处理脚本（47 张母版 → 118 个成品，含裁切 / 冷调 / 校名合成） |

## 技术栈

| 层 | 选型 | 版本 |
|---|---|---|
| 框架 | Next.js 16（App Router + Turbopack） | 16.3.8 |
| UI | React 19 / Tailwind CSS v4 / shadcn-ui | 19.2.8 / 4.3.3 / 4.21.0 |
| 数据库 | Prisma 7 + `@prisma/adapter-pg` → **Supabase PostgreSQL** | 7.10.0 |
| 认证 | Auth.js v5（Credentials + JWT 会话 + bcrypt） | 5.0.0-beta.32 |
| 多语言 | next-intl（`as-needed`） | 4.14.8 |
| 富文本 | Tiptap v3 | 3.31.4 |
| 图表 | Recharts | 3.8.0 |
| 动效 | motion（`motion/react`，尊重 `prefers-reduced-motion`） | 13.4.6 |
| 校验 | zod 4 + react-hook-form | 4.6.5 / 7.89.0 |
| 搜索 | Fuse.js | 7.5.0 |
| 字体 | `next/font/local` 自托管 Geist（**构建期零外网**） | — |
| 测试 | Vitest / Playwright | 5.0.3 / 1.63.0 |

## 启动（三步）

> **前置**：Node `^20.19 || ^22.12 || >=24.0`、pnpm `>=12.8.1`，以及一个**外部 Supabase 项目**（见下）。

```bash
# 第 0 步 · 环境变量（数据库串 + AUTH_SECRET）
cp .env.example .env      # 字段清单见 ../docs/环境变量.txt

# 第 1 步 · 安装依赖
pnpm install

# 第 2 步 · 建表 + 灌种子（幂等，可重复执行）
pnpm db:push              # 首次：把 schema 同步到 Supabase
pnpm db:seed              # 100 篇文章 / 站点 / 导航 / 配置 / 媒体 / 统计

# 第 3 步 · 开发服务器
pnpm dev                  # http://localhost:3000 → 302 /main ；后台 /admin
```

### 环境变量（`app/.env`，模板见 `app/.env.example`）

| 变量 | 用途 | 备注 |
|---|---|---|
| `DATABASE_URL` | **运行时**连接串 | Supabase **pooler**（6543，pgbouncer / transaction 模式） |
| `DIRECT_URL` | **Prisma CLI**（`db push` / `db seed`）连接串 | Supabase **直连**（5432） |
| `AUTH_SECRET` | Auth.js 会话签名 | 生成：`npx auth secret` |
| （可选）其它 | 见 `../docs/环境变量.txt` | — |

> ⚠ **本作品集的部署形态要求外部 Supabase 项目**（本地与生产**共用**同一套 Postgres，故不提供 SQLite 快速通道）。
> 连接池已按跨区延迟调过：`max: 10` / `idleTimeoutMillis: 5000` / `connectionTimeoutMillis: 15000`（见 `src/lib/prisma.ts`）。

## 演示账号

| 角色 | 用户名 | 密码 | 权限范围 |
|---|---|---|---|
| 超级管理员 | `admin` | `admin123` | 全部（含跨站点） |
| 站点管理员 | `site_admin` | `admin123` | 本站（main） |
| 栏目编辑 | `editor` | `admin123` | 本栏目 / 本人稿件 |
| 审核员 | `auditor` | `admin123` | 审核（本站） |

登录入口 `/admin/login`；密码在 seed 中以 **bcrypt（rounds=10）** 存储。2 分钟演示动线（浏览 → 搜索 / 双语 → 无障碍 → 编辑提交 → 审核发布 → 统计）见 [`../docs/07-演示账号与链路.md`](../docs/07-演示账号与链路/07-演示账号与链路.md)。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 开发（Turbopack）/ 生产构建 / 生产启动 |
| `pnpm lint` / `pnpm typecheck` | ESLint（零输出为过）/ `next typegen && tsc --noEmit` |
| `pnpm db:seed` | **幂等**种子（21 个 `seedXxx` 全部 `upsert`，可反复执行） |
| `pnpm db:push` | 把 `schema.prisma` 同步到数据库（无 migrations 目录） |
| `pnpm db:reset` | **破坏性**全库重建：需 `ALLOW_DB_RESET=1`，否则脚本直接拒绝 |
| `pnpm db:setup` | `db:push` + `db:seed`（首次一步到位） |
| `pnpm test` / `pnpm test:unit` / `pnpm test:component` / `pnpm test:e2e` | Vitest 全量 / 单元 / 组件 / Playwright E2E |
| `pnpm format` | Prettier 全量格式化 |
| `python app/scripts/process-images.py --dry-run` | 图片批处理（**只打印计划**；去掉 `--dry-run` 才写文件） |

## 架构

```text
        用户（浏览器 · 桌面 / 移动）
                 │
                 ▼
   ┌──────────────────────────────────────────┐
   │  Next.js 16 全栈（App Router，单进程）    │
   │  ├─ 前台 (site)/[locale]/[site]/**  ISR  │
   │  ├─ 后台 admin/**（SSR，无 locale）      │
   │  ├─ Route Handlers  /api/**              │
   │  └─ Server Actions（写路径全部走信封）    │
   └──────────────────────────────────────────┘
          │                          │
          │ Prisma 7                 │ next/image（unoptimized）
          │ @prisma/adapter-pg       ▼
          ▼                    public/uploads/seed/
   ┌──────────────────┐        （118 个成品素材，已入库）
   │ Supabase         │
   │ PostgreSQL       │  6543 pooler（运行时）
   │ （韩国首尔）      │  5432 直连（Prisma CLI）
   └──────────────────┘
```

- **渲染策略**：前台内容页 ISR（`revalidate` 300 / 3600）、搜索页 SSR、后台全部 SSR；**不加 `generateStaticParams`** ⇒ 构建期不连库。
- **写路径**：全部经 Server Action，统一 `Ok<T> / Fail` 信封；含写事务显式放宽 `maxWait 10s / timeout 15s`。

## 已知限制

1. **公网访问**：`*.vercel.app` 在国内被 **DNS 污染 + SNI 阻断** ⇒ **放弃公网部署**，展示形态 = **GitHub 仓库 + 本地录屏**。
   **演示视频：本地录屏 5 分钟（未公开分享）**，文件在 `docs/演示视频/`（**已被 `.gitignore` 排除，不进仓库**）；自动演示脚本见 `tests/demo-video.spec.ts` + `playwright.demo.config.ts`。
2. **媒体存储**：生产侧**未接** Supabase Storage（`StorageAdapter` 抽象已就位，本地实现走 `public/uploads/`）；跨实例部署需补（`docs/11` A33）。
3. **无注册 / 无找回密码**：只有 seed 的 4 个演示账号（+7 个数据填充账号），无公开注册、无 OAuth、无邮件服务。
4. **Auth.js v5 仍为 beta**（`5.0.0-beta.32`）⇒ 升级前必须回归登录与权限链路。
5. **不做的功能**：人才招聘与在线投递、录取查询、一卡通 / 教务 / 图书馆真实对接、短信 / 支付 / SSO、RSS / 订阅、小程序、埋点、备案与等保（详见 [`../docs/03-功能范围.txt`](../docs/03-功能范围/03-功能范围.txt) §明确不做）。

## 合规声明

- 本站为**技术演示项目**，**非真实教育机构**；不冒充任何真实单位。
- 校名、院系、人物、新闻、数据、地址与联系方式**均为虚构**，与真实机构无关。
- **不伪造备案号**：页脚显示"演示项目（无备案号）"；"学生 / 教职工 / 访客 / 服务链接"等入口为**演示占位**（`#`）。
- 站点图片为 **AI 生成**的虚构校园场景，非真实校园。

## 文档索引（`../docs/`）

| 文档 | 内容 |
|---|---|
| [`00-项目状态.md`](../docs/00-项目状态.md) | 总进度、环境限制、§8 规格矛盾清单（**建议先读**） |
| [`07-演示账号与链路.md`](../docs/07-演示账号与链路/07-演示账号与链路.md) | 演示账号 + 2 分钟演示动线 |
| [`11-裁决记录.md`](../docs/11-裁决记录.md) | A1~A40 裁决记录（**权威**） |
| [`12-技术栈冻结.md`](../docs/12-技术栈冻结.md) | 技术栈与版本冻结、工程化地基 |
| [`13-数据模型-v2.md`](../docs/13-数据模型-v2.md) | 21 张表 / 24 model 规格 + 种子映射 |
| [`14-API契约.md`](../docs/14-API契约.md) | Server Action / Route Handler 边界、权限码清单 |
| [`15-路由规格.md`](../docs/15-路由规格.md) | 路由树、locale 规则、`proxy.ts` 职责 |
| [`16-测试与验收规格.md`](../docs/16-测试与验收规格.md) | 测试分层、用例目录、各任务 DoD |
| [`17-批次B命令序列.md`](../docs/17-批次B命令序列.md) | 依赖安装与实测命令序列 |
| [`M6-状态交接.md`](../docs/M6-状态交接.md) | M6 阶段交接（已完成 / 已绕过 / 决策变更 / 待办） |
| `明德大学-图片提示词库 / 图片清单 / 图片映射表.md` | 出图提示词、素材清单与落盘映射（含"素材与仓库"约定） |
| `01`~`10`（目录形态） | 项目定位 / 技术选型 / 功能范围 / 数据库设计 / 页面路由 / 开发排期 / 设计规范 / 组件清单 / 种子数据说明 |
| `环境变量.txt` / `API 路由.txt` / `后台路由.txt` | 环境变量清单与路由清单 |

> `docs/` 是规格与决策的唯一来源；代码与文档冲突时**以 `docs/` 为准**（见 `docs/00` §0）。

## 项目结构

```text
app/
├── src/proxy.ts                  # 根级拦截：locale 协商 + /admin/* 会话检查
├── src/i18n/                     # routing / request / navigation + messages/{zh,en}.json
├── src/app/
│   ├── (site)/[locale]/[site]/   # 前台 21 条路由（首页 / 新闻 / 公告 / 单页 / 栏目四分支 / 搜索）
│   ├── admin/                    # 后台 16 条路由（不走 locale，全部 SSR）
│   ├── api/                      # search / comments / export / media 上传 / auth
│   └── sitemap.ts / robots.ts    # MetadataRoute
├── src/components/               # home/（首页区块）· site/（页头页脚）· ui/（shadcn，冻结）
├── prisma/schema.prisma          # 24 model
├── prisma/seed.ts                # 幂等 seed（21 个 seedXxx）
├── scripts/process-images.py     # 图片批处理（读 assets-src/seed-masters/）
├── assets-src/seed-masters/      # 47 张出图母版 PNG（537 MB，**不入库**）
├── public/uploads/seed/          # 118 个成品素材（**已入库**，34.6 MB）
└── tests/                        # Vitest + Playwright
```
