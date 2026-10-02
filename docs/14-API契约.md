# API 契约

> 定义前台与后台**每个数据入口**的路径、入参、返回、权限与对应数据模型。
> 本文件只写契约，不含实现。实现分属第 2~5 周。
>
> - 文档版本：**v1.1**
> - 编写日期：2026-10-01
> - 状态：**✅ 已确认**（决策者于 2026-10-01 确认，§8 的 7 条未决问题已全部裁决结案）
> - 依据：`11-裁决记录.md` A24（读写边界）、`13-数据模型-v2.md`（24 个 model）、`05-页面路由.txt`（后台路由）
> - 冲突处理：以本文件为准；与 `API 路由.txt`（原始输入，仅 10 条路由）冲突时以本文件为准

---

## 0. 本文件解决什么

原始输入 `API 路由.txt` 只列了 10 条路由（`auth` / `articles` / `channels` / `media` / `search` / `audits` / `statistics` / `forms`），但后台有 **14 个页面**、数据模型有 **24 个 model**。缺口包括：

| 缺口 | 本文件覆盖 |
|---|---|
| 用户/角色/权限 | §5.6、§5.7 |
| 单页 `Page`、导航 `Navigation` | §5.2、§5.3 |
| 评论 `Comment`、留言 `Message` | §5.4 |
| 配置 `Config` | §5.10 |
| 版本 `ArticleVersion`、回收站 | §5.8 |
| 定时发布 `publishTime` | §5.9 |
| 标签 `tags` | §5.11 |
| 埋点（本期不做，仅占位） | §5.12 |
| 附件 `Attachment` 上传与下载计数 | §5.3（Route Handler 部分） |
| 导出（Excel/CSV） | §6.2 |

**明确不做**（A24）：Swagger/OpenAPI 文档、API 密钥、限流、接口调用统计。

---

## 1. 边界规则：Server Action vs Route Handler

### 1.1 三条判断规则（不逐条列举，按规则归类）

| # | 规则 | 判定结果 |
|---|---|---|
| **R1** | 调用方是**本站页面/表单**，且需要 `revalidatePath` 或 `redirect` | **Server Action** |
| **R2** | 调用方是**本站页面**，但是纯读取展示（列表/详情/看板） | **Server Action**（服务端组件直接 `await`，不经过 HTTP 层） |
| **R3** | 调用方**不是本站页面**，或需要非 RSC 的能力 | **Route Handler** |

**R3 的四种具体情形**（这是唯一需要记的例外清单）：

| 情形 | 原因 | 例子 |
|---|---|---|
| 第三方/浏览器直接调用 | 没有 RSC 上下文 | 搜索接口、埋点、Auth.js 回调 |
| 需要非 JSON 的媒体类型 | Server Action 只走 RSC 协议 | `multipart/form-data` 上传、文件下载、Excel/CSV 导出 |
| 需要 HTTP 语义 | 状态码/头/重定向/缓存由 HTTP 层控制 | `sitemap.xml`、`robots.txt`、`/api/revalidate` |
| Auth.js 框架要求 | 库的约定 | `/api/auth/[...nextauth]` |

### 1.2 由此得出的四类归口

| 类别 | 归口 | 说明 |
|---|---|---|
| **后台写操作**（增/改/删/审核/排序/状态切换） | **Server Action** | R1 |
| **后台读操作**（列表/详情/看板/树） | **Server Action** | R2，服务端组件内直接调用，**不产生 HTTP 端点** |
| **公开读接口**（前台列表/详情/搜索/统计/标签） | **Route Handler** | R3（第三方与浏览器可能调用） |
| **文件与导出**（上传/下载/导出） | **Route Handler** | R3（媒体类型） |

> **重要含义**：后台的"读取"没有 REST 端点，所以本文件的 §5 里"后台读"一栏写的是 **Server Action 函数名**（如 `listArticles`），而不是 URL。这是刻意的 —— 它避免把"表单 → 接口 → 表单"重复写两遍（A24 的理由）。

### 1.3 命名约定

| 类型 | 位置 | 命名 |
|---|---|---|
| Server Action | `src/app/admin/**/actions.ts` | 动词开头：`createArticle` / `submitForReview` / `unpublishArticle` |
| Route Handler | `src/app/api/**/route.ts` | 名词路径：`/api/articles` / `/api/search` |

---

## 2. 统一约定

### 2.1 返回格式

**所有 Server Action 与 Route Handler 的 JSON 返回，统一为下面两种形状之一（判别联合，用 `ok` 区分）：**

```ts
// 成功
type Ok<T> = { ok: true; data: T }

// 失败
type Fail = {
  ok: false
  code: ErrorCode          // 见 §2.2
  message: string          // 面向用户的中文提示，可直接 toast
  field?: string           // 表单类错误：指明哪个字段（如 "slug"）
  details?: unknown        // 仅开发环境输出，生产环境不下发
}

// 分页列表（data 的形状）
type Paginated<T> = {
  items: T[]
  page: number             // 从 1 开始
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
}
```

**约定细节**：

| 项 | 约定 |
|---|---|
| 字段命名 | JSON 一律 **camelCase**（与 Prisma 模型字段一致，不做下划线转换） |
| 日期时间 | 一律 **UTC ISO 8601**（如 `2026-10-01T10:04:14.162Z`）；展示层转 `Asia/Shanghai`（A32） |
| 日期（仅日期） | `dateKey` 类字段用 `YYYY-MM-DD` 字符串，**不是 Date** |
| 空值 | 用 `null`，不用 `undefined`（JSON 不支持 undefined） |
| ID | 一律 `string`（cuid） |
| 富文本 | `content` 为**已清洗的 HTML 字符串**（A30，写入侧 sanitize-html） |
| 布尔 | `true` / `false`，不用 0/1 |

### 2.2 错误码

**HTTP 状态码 + 业务 `code` 双轨**：状态码给中间件/浏览器看，`code` 给前端分支判断用。
不用纯数字业务码（如 `10001`）—— 字符串枚举自解释、可被 TS 联合类型穷尽检查。

| `code` | HTTP | 含义 | 典型触发 |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | 入参校验失败（zod） | slug 含非法字符、必填项为空 |
| `INVALID_STATE_TRANSITION` | 400 | 状态机非法流转 | 对 `draft` 直接调用发布（违反 `13` 缺口 7 / C2） |
| `UNAUTHORIZED` | 401 | 未登录 / 会话过期 | 访问后台且无 session |
| `FORBIDDEN` | 403 | 已登录但无权限 | `editor` 试图撤稿；跨站点访问（违反 C4） |
| `NOT_FOUND` | 404 | 资源不存在 | 文章 id 不存在 |
| `SLUG_RESERVED` | 409 | slug 命中保留黑名单（A19） | 栏目起名 `news` |
| `SLUG_TAKEN` | 409 | slug 在站点内重复 | 违反 `@@unique([siteId, slug])` |
| `CONFLICT` | 409 | 其它唯一约束冲突 | 用户名重复、角色码重复 |
| `IN_USE` | 409 | 被引用，不能删除 | 删除仍挂有文章的栏目 |
| `SOFT_DELETED` | 409 | 资源在回收站中 | 对已软删除文章做编辑 |
| `PAYLOAD_TOO_LARGE` | 413 | 超出体积限制 | 上传 > 10MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 文件类型不允许 | 上传 `.exe` |
| `RATE_LIMITED` | 429 | 限流 | **本期不实现**（A24），占位 |
| `INTERNAL_ERROR` | 500 | 未预期异常 | 兜底 |

**客户端约定**：前端只需处理 `UNAUTHORIZED`（跳登录）、`FORBIDDEN`（提示无权限）、`VALIDATION_FAILED`（回填 `field`）、其余统一 toast `message`。

### 2.3 分页与排序

| 参数 | 类型 | 默认 | 上限 | 说明 |
|---|---|---|---|---|
| `page` | int | `1` | — | 从 1 开始；非法值按 1 处理 |
| `pageSize` | int | `20` | **`100`** | 超过上限被截断为 100，不报错 |
| `sortBy` | string | 各接口指定 | 白名单 | **非白名单字段忽略并回落默认**（防注入） |
| `sortOrder` | `asc` \| `desc` | `desc` | — | 非法值按 desc |

**不采用游标分页**：数据量小（文章 100 篇、媒体 50 条），offset 足够；且后台表格需要"跳到第 N 页"与总数，游标分页做不了。

**返回 `total` 与 `totalPages` 的成本**：用 `prisma.$transaction([findMany, count])` 一次拿齐。

### 2.4 鉴权与授权

**三层校验，缺一不可**（对应 `13` 缺口 7 的约束 C2/C4）：

| 层 | 做什么 | 实现位置 |
|---|---|---|
| **L1 认证** | 是否登录、会话是否有效 | Server Action 内 `const session = await auth()`；Route Handler 同理 |
| **L2 权限** | 是否有该操作权限（`Permission.code`） | 查 `UserRole → RolePermission → Permission`；`super_admin` 短路放行 |
| **L3 数据范围** | 该记录是否属于自己可管范围 | 站点：`session.user.siteId` 与记录 `siteId` 比对；`super_admin` 为 `null` 表示全站；`editor` 另需 `createdById === session.user.id`（C4） |

**统一辅助函数契约**（实现细节见第 4 周）：

```ts
// 所有需要鉴权的 Server Action / Route Handler 第一行调用
requirePermission(session, "article.update", { siteId: target.siteId })
// 失败抛 ForbiddenError，由统一错误映射转为 { ok:false, code:"FORBIDDEN" }
```

**公开接口无需 L1/L2/L3**，但**必须**附加 `status = 'published' AND deletedAt IS NULL` 过滤（C5）。

**不采用**：API Key、JWT 自签、IP 白名单、CORS 白名单（同源部署，A24）。

### 2.5 写操作通用要求

| 要求 | 说明 |
|---|---|
| 入参校验 | 一律 **zod schema**（与表单共用同一份 schema，避免两处漂移） |
| 富文本 | 写入前 `sanitize-html` 白名单清洗（A30） |
| 状态流转 | 服务端**必须比对 `fromStatus` 与数据库当前值**，不一致返回 `INVALID_STATE_TRANSITION`（C2） |
| 审核留痕 | 任何状态变更必须同事务写入 `AuditRecord`（C1） |
| 版本快照 | 修改 `published` 文章前必须先落 `ArticleVersion`（C3） |
| 软删除 | 删除一律置 `deletedAt`；彻底删除仅在回收站接口 |
| 幂等 | 创建类操作以唯一键冲突返回 `SLUG_TAKEN`/`CONFLICT`，不重复插入 |

---

## 3. 后台 15 行契约表的数据入口对照（14 个菜单页面 + 单页 + 回收站）

> "读"列为 Server Action 函数名（无 HTTP 端点，见 §1.2）；"写"列同理。

| 后台页面 | 读入口 | 写入口 | 对应 model |
|---|---|---|---|
| `/admin/dashboard` | `getDashboardStats` / `getVisitTrend` / `getArticleRanking` / `getChannelRanking` | — | `Statistic`、`Article`、`Channel` |
| `/admin/articles` | `listArticles` | `deleteArticle` / `restoreArticle` / `bulkDeleteArticles` | `Article` |
| `/admin/articles/new` | `getChannelTree` / `listMedia` | `createArticle` / `saveArticleDraft` | `Article`、`Channel`、`Media` |
| `/admin/articles/[id]/edit` | `getArticle` / `listVersions` / `listAuditRecords` / `listAttachments` | `updateArticle` / `submitForReview` / `reviewArticle` / `publishArticle` / `rejectArticle` / `withdrawArticle` / `restoreVersion` / `deleteAttachment` | `Article`、`ArticleVersion`、`AuditRecord`、`Attachment` |
| `/admin/channels` | `getChannelTree` / `listNavigations` | `createChannel` / `updateChannel` / `deleteChannel` / `reorderChannels` / `createNavigation` / `updateNavigation` / `deleteNavigation` | `Channel`、`Navigation` |
| `/admin/media` | `listMedia` / `listAlbums` | `updateMedia` / `deleteMedia` / `bulkDeleteMedia` | `Media` |
| `/admin/users` | `listUsers` | `createUser` / `updateUser` / `resetPassword` / `toggleUserStatus` / `assignUserRole` | `User`、`UserRole` |
| `/admin/roles` | `listRoles` / `listPermissions` / `getRolePermissions` | `createRole` / `updateRole` / `deleteRole` / `setRolePermissions` / `revokeUserRole` | `Role`、`Permission`、`RolePermission`、`UserRole` |
| `/admin/sites` | `listSites` | `createSite` / `updateSite` / `toggleSiteStatus` | `Site` |
| `/admin/audits` | `listPendingAudits` | `reviewArticle` / `publishArticle` / `rejectArticle` | `Article`、`AuditRecord` |
| `/admin/forms` | `listForms` / `listFormData` | `createForm` / `updateForm` / `deleteForm` / `updateFormDataStatus` | `Form`、`FormData` |
| `/admin/comments` | `listComments` | `approveComment` / `rejectComment` / `replyComment` / `deleteComment` | `Comment` |
| `/admin/messages` | `listMessages` | `replyMessage` / `updateMessageStatus` / `deleteMessage` | `Message` |
| `/admin/statistics` | `getVisitTrend` / `getSourceBreakdown` / `getArticleRanking` / `getChannelRanking` / `getTopSearchTerms` | — | `Statistic`、`Article`、`Channel` |
| `/admin/settings` | `listConfigs` / `listLogs` | `updateConfigs` | `Config`、`Log` |
| **页面路由之外** | — | — | — |
| 单页编辑（学校简介等） | `getPage` / `listPages` | `createPage` / `updatePage` / `deletePage` | `Page` |
| 回收站 | `listRecycleBin` | `restoreFromRecycle` / `purgeFromRecycle` | `Article`、`Page`、`Media`、`Comment`、`Attachment` |

> **覆盖检查**：§3 共 **15 行**（14 个菜单页面 + 单页 + 回收站；另有 `/admin/login` 与 2 条"页面路由之外"的入口），全部有读写入口；每个 `13` 的业务 model 都被至少一个入口覆盖（除 `Account`/`Session`/`VerificationToken`，由 Auth.js 内部管理）。

---

## 4. Route Handler 总览（本文件定义的全部 HTTP 端点）

### 4.1 公开接口（无需登录）

| 方法 | 路径 | 用途 | model |
|---|---|---|---|
| GET | `/api/articles` | 站点文章列表（分页、栏目/标签筛选） | `Article` |
| GET | `/api/articles/[idOrSlug]` | 文章详情 | `Article`、`Attachment`、`Channel` |
| GET | `/api/articles/[idOrSlug]/related` | 相关阅读（同栏目排除自身，取 5 条） | `Article` |
| POST | `/api/articles/[idOrSlug]/view` | 浏览量 +1 | `Article` |
| GET | `/api/channels/[site]` | 站点栏目树（前台导航用） | `Channel` |
| GET | `/api/pages/[site]/[slug]` | 单页正文 | `Page` |
| GET | `/api/pages/[site]?channel=[slug]` | 按栏目 slug 取单页（§5.2；**T1.10 补登**） | `Page` |
| GET | `/api/navigations/[site]` | 站点导航树 | `Navigation` |
| GET | `/api/search` | 全站搜索（`contains` 运行时检索） | `Article` |
| GET | `/api/tags` | 标签聚合（用于输入建议） | `Article` |
| GET | `/api/comments` | 文章已通过评论（两级） | `Comment` |
| POST | `/api/comments` | 提交评论（匿名） | `Comment` |
| POST | `/api/forms/[id]/submit` | 表单提交 —— **本期不做**（`14` §5.12 / §8 A2；T1.10 标注） | `FormData` |
| POST | `/api/messages` | 留言提交（含匿名） | `Message` |
| GET | `/api/files/[...path]` | 媒体/附件读取 | `Media`、`Attachment` |
| GET | `/api/files/[id]/download` | 附件下载（计数 +1） | `Attachment` |
| GET/POST | `/api/auth/[...nextauth]` | Auth.js 回调（框架要求） | `User`、`Account`、`Session` |
| GET | `/api/statistics/views` | 访问趋势 | `Statistic` |
| GET | `/api/statistics/articles` | 文章排行 | `Article` |
| GET | `/api/statistics/channels` | 栏目排行 | `Channel` |
| GET | `/api/statistics/sources` | 来源分布 | `Statistic` |

### 4.2 受保护接口（需登录 + 权限）

| 方法 | 路径 | 用途 | 权限 | model |
|---|---|---|---|---|
| POST | `/api/media/upload` | 媒体/附件上传（`multipart/form-data`） | `media.upload` | `Media`、`Attachment` |
| POST | `/api/revalidate` | 按路径/标签触发 ISR 重校验 | `config.manage` | — |
| GET | `/api/export/articles` | 导出文章 Excel/CSV | `article.read` | `Article` |
| GET | `/api/export/form-data` | 导出表单数据 | `form.manage` | `FormData` |
| GET | `/api/export/statistics` | 导出统计报表 | `statistics.read` | `Statistic` |
| POST | `/api/logs` | 前端上报操作日志 | `log.write` | `Log` |
| POST | `/api/track` | 埋点接收 —— **本期不实现**（A26），仅占位 | — | `Statistic` |

### 4.3 MetadataRoute（框架约定，非 Route Handler）

| 文件 | 产出 | 数据源 | 依据 |
|---|---|---|---|
| `app/sitemap.ts` | `/sitemap.xml` | `Site` + `Channel` + `Article(published)` + `Page(published)` | A23 |
| `app/robots.ts` | `/robots.txt` | `Config(group=seo)` | A23 |

---

## 5. 详细契约（按领域）

> **通用约定**：以下所有接口的返回均遵循 §2.1 的 `Ok`/`Fail`；分页参数均遵循 §2.3；所有受保护接口均需 §2.4 的三层校验。表格中"权限"列写 `Permission.code`，`—` 表示公开。

### 5.1 Article（文章 / 新闻中心 / 审核流 / 回收站）

**model**：`Article`、`ArticleVersion`、`AuditRecord`、`Attachment`（`13` §2）

#### 读取（Server Action）

| 函数 | 入参（关键） | 返回 |
|---|---|---|
| `listArticles` | `{ siteId?, channelId?, status?, keyword?, createdById?, includeDeleted?, page, pageSize, sortBy, sortOrder }` | `Paginated<ArticleListItem>`，`ArticleListItem` 含 `id/title/slug/status/channel.name/createdBy.name/publishTime/viewCount/updatedAt/commentCount` |
| `getArticle` | `{ id }` | `ArticleDetail`（含 `content`、`attachments[]`、`channelId`、`createdById`、`mediaIds[]`） |
| `listVersions` | `{ articleId, page, pageSize }` | `Paginated<ArticleVersion>`（`version/title/editor/createdAt`） |
| `listAuditRecords` | `{ articleId }` | `AuditRecord[]`（按 `createdAt` 升序，用于时间线；含 `fromStatus`/`toStatus`） |
| `listPendingAudits` | `{ siteId?, targetStatus?, page, pageSize }` | `Paginated<ArticleListItem>`（按 `toStatus` 过滤待办） |

#### 写入（Server Action）

| 函数 | 入参（关键） | 权限 | 状态机 / 约束 |
|---|---|---|---|
| `createArticle` | `{ siteId, channelId, title, slug, summary?, content, cover?, author?, source?, tags?, mediaIds? }` | `article.create` | 落库为 `draft`；`createdById = session.user.id` |
| `saveArticleDraft` | `{ id, ...同上 }` | `article.update` | 任意状态 → `draft`（边 8）；写 `AuditRecord(submit, fromStatus, draft)` |
| `updateArticle` | `{ id, ...字段 }` | `article.update` | 若当前为 `published`：**先落 `ArticleVersion` 快照**再转 `draft`（C3） |
| `submitForReview` | `{ id }` | `article.submit` | `draft` 或 `withdrawn` → `pending_first`（边 1/7） |
| `reviewArticle` | `{ id, action: "pass" \| "reject", comment? }` | `article.audit` | `pass`：`pending_first` → `pending_final`（边 2）；`reject`：`pending_first`/`pending_final` → `rejected`（边 4/5） |
| `publishArticle` | `{ id, publishTime? }` | `article.publish` | `pending_final` → `published`（边 3）；`publishTime` 未来时间表示定时发布，立即置 `published` 但前台按 `publishTime <= now` 过滤（见 §5.9） |
| `withdrawArticle` | `{ id, comment? }` | `article.withdraw` | `published` → `withdrawn`（边 6）；`editor` 无权（403） |
| `restoreVersion` | `{ id, version }` | `article.update` | 用该版本 `title`/`content` 覆盖当前值，并**先落一份快照**再改（避免丢当前内容） |
| `deleteArticle` | `{ id }` | `article.delete` | 软删除：置 `deletedAt`（A13） |
| `bulkDeleteArticles` | `{ ids[] }` | `article.delete` | 逐条软删除；返回 `{ succeeded, failed: [{id, code}] }` |

**所有状态变更的共同要求**：入参可选带 `fromStatus` 用于乐观并发校验；与库中不一致时返回 `INVALID_STATE_TRANSITION`（C2）。

#### 公开接口（Route Handler）

**`GET /api/articles`**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `site` | string | ✅ | 站点 slug（`main`/`cs`/`ee`/`ba`） |
| `channel` | string | | 栏目 slug |
| `tag` | string | | 标签（对 `tags` JSON 字符串做 `contains` 匹配） |
| `top` | boolean | | 仅置顶 |
| `recommend` | boolean | | 仅推荐 |
| `page` / `pageSize` | int | | 见 §2.3 |

返回：`Ok<Paginated<ArticleListItem>>`。**过滤条件固定包含** `status='published' AND deletedAt IS NULL AND (publishTime IS NULL OR publishTime <= now)`。

**`GET /api/articles/[idOrSlug]`** → `Ok<ArticleDetail>`，含 `attachments[]`（`fileName/filePath/size/mimeType/downloadCount`）与 `channel`。未发布返回 `NOT_FOUND`（不泄露草稿存在性）。

**`POST /api/articles/[idOrSlug]/view`** → `Ok<{ viewCount: number }>`。对 `viewCount` 做原子自增。**不做 UV 去重**（无埋点，A26）。

### 5.2 Page（单页内容）

**model**：`Page`（`13` 缺口 1）

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listPages({ siteId, channelId?, page, pageSize })` | — | `page.read` |
| SA | `getPage({ id })` | — | `page.read` |
| SA | `createPage({ siteId, channelId, title, slug, content, seoTitle?, seoDescription?, seoKeywords? })` | 一个栏目仅一篇，冲突返回 `CONFLICT` | `page.manage` |
| SA | `updatePage({ id, ...字段, status? })` | `status` ∈ `draft`/`published` | `page.manage` |
| SA | `deletePage({ id })` | 软删除 | `page.manage` |
| RH | `GET /api/pages/[site]/[slug]` | — | 公开 |
| RH | `GET /api/pages/[site]?channel=[slug]` | — | 公开 |

> 单页不走审核流（`13` 缺口 1），因此没有 `submitForReview`。

### 5.3 Channel / Navigation / Media / Attachment

#### Channel（栏目：无限级树）

**model**：`Channel`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `getChannelTree({ siteId, includeHidden? })` | — | `channel.read` |
| SA | `createChannel({ siteId, parentId?, name, slug, type, template?, formId?, url?, description?, sort? })` | `slug` 命中黑名单 → `SLUG_RESERVED`（A19）；`type` ∈ `list`/`page`/`link`/`form`；`type=link` 时 `url` 必填，`type=form` 时 `formId` 必填（否则 `VALIDATION_FAILED`） | `channel.manage` |
| SA | `updateChannel({ id, ...字段 })` | 改 `slug` 需重新校验黑名单与唯一性；改 `type` 需重新校验类型专属字段（`link→url`、`form→formId`） | `channel.manage` |
| SA | `deleteChannel({ id })` | 有子栏目或文章 → `IN_USE` | `channel.manage` |
| SA | `reorderChannels({ items: [{ id, parentId, sort }] })` | 批量拖拽排序，事务内更新 | `channel.manage` |
| RH | `GET /api/channels/[site]` | 返回嵌套树，仅 `status=true` | 公开 |

#### Navigation（导航）

**model**：`Navigation`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listNavigations({ siteId })` | — | `channel.read` |
| SA | `createNavigation({ siteId, parentId?, name, channelId?, url?, target?, icon?, sort? })` | `channelId` 与 `url` **至少一个非空**，否则 `VALIDATION_FAILED` | `channel.manage` |
| SA | `updateNavigation({ id, ...字段 })` | 同上 | `channel.manage` |
| SA | `deleteNavigation({ id })` | 级联子项 | `channel.manage` |
| RH | `GET /api/navigations/[site]` | 返回嵌套树 | 公开 |

#### Media（媒体库）

**model**：`Media`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listMedia({ siteId?, folder?, album?, type?, keyword?, page, pageSize })` | — | `media.read` |
| SA | `listAlbums({ siteId })` | 返回 `album` 去重列表 | `media.read` |
| SA | `updateMedia({ id, name?, folder?, album? })` | — | `media.manage` |
| SA | `deleteMedia({ id })` | 软删除 | `media.manage` |
| SA | `bulkDeleteMedia({ ids[] })` | — | `media.manage` |
| RH | `POST /api/media/upload` | `multipart/form-data`：`file`、`folder?`、`siteId?` | `media.upload` |
| RH | `GET /api/files/[...path]` | 本地：读 `public/uploads`；生产：302 到 Supabase Storage 签名 URL（A33） | 公开 |

**上传约束**：

| 项 | 值 |
|---|---|
| 单文件上限 | **10 MB**（超出 → `PAYLOAD_TOO_LARGE`） |
| 允许类型 | `image/jpeg`、`image/png`、`image/webp`、`image/svg+xml`、`video/mp4`、`application/pdf`、`application/msword`、`application/vnd.openxmlformats-officedocument.*`（其余 → `UNSUPPORTED_MEDIA_TYPE`） |
| 返回 | `Ok<Media>`（含 `id/path/url/size/mimeType/width?/height?`） |
| 存储 | 通过 `StorageAdapter` 抽象；开发 `LocalStorageAdapter`，生产 `SupabaseStorageAdapter`（A33） |

#### Attachment（附件）

**model**：`Attachment`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listAttachments({ articleId?, pageId? })` | 按 `sort` 升序 | `article.read` |
| SA | `createAttachment({ articleId?, pageId?, mediaId?, fileName, filePath, size, mimeType?, sort? })` | `articleId`/`pageId` 至少一个 | `article.update` |
| SA | `deleteAttachment({ id })` | 软删除 | `article.update` |
| RH | `GET /api/files/[id]/download` | 置 `Content-Disposition: attachment`，`downloadCount` 原子 +1 | 公开 |

### 5.4 Comment / Message（互动）

#### Comment（评论，两级）

**model**：`Comment`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listComments({ siteId?, articleId?, status?, page, pageSize })` | — | `comment.manage` |
| SA | `approveComment({ id })` | `pending` → `approved` | `comment.manage` |
| SA | `rejectComment({ id })` | `pending` → `rejected` | `comment.manage` |
| SA | `replyComment({ id, content })` | 父评论必须为顶级（`parentId === null`），否则 `VALIDATION_FAILED`（两级限制） | `comment.manage` |
| SA | `deleteComment({ id })` | 软删除；级联回复一并软删除 | `comment.manage` |
| RH | `GET /api/comments?articleId=&page=&pageSize=` | 仅 `status='approved' AND deletedAt IS NULL`，返回顶级评论 + 各自 `replies[]` | 公开 |
| RH | `POST /api/comments` | `{ articleId, name, email?, content, parentId? }` | 公开 |

**公开提交的额外约束**：落库 `status='pending'`（需审核）、记录 `ip`、`siteId` 由文章推导（客户端不传）。

#### Message（留言 / 领导信箱）

**model**：`Message`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listMessages({ type?, status?, page, pageSize })` | — | `message.manage` |
| SA | `replyMessage({ id, reply })` | 置 `status='replied'`、`repliedAt=now` | `message.manage` |
| SA | `updateMessageStatus({ id, status })` | `pending`/`processing`/`replied` | `message.manage` |
| SA | `deleteMessage({ id })` | 物理删除（留言无回收站需求） | `message.manage` |
| RH | `POST /api/messages` | `{ type, name, contact?, content }` | 公开 |

### 5.5 Form / FormData（表单）

**model**：`Form`、`FormData`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listForms({ siteId?, page, pageSize })` | — | `form.manage` |
| SA | `createForm({ siteId?, name, fields })` | `fields` 为 JSON 字符串（字段定义数组） | `form.manage` |
| SA | `updateForm({ id, name?, fields?, status? })` | — | `form.manage` |
| SA | `deleteForm({ id })` | 有数据 → `IN_USE` | `form.manage` |
| SA | `listFormData({ formId, status?, page, pageSize })` | — | `form.manage` |
| SA | `updateFormDataStatus({ id, status })` | `new`/`read`/`archived` | `form.manage` |
| RH | `POST /api/forms/[id]/submit` | 请求体 JSON，**按 `fields` 定义做动态校验**（未知字段丢弃，必填缺失 → `VALIDATION_FAILED`） | 公开 |

**`fields` JSON 形状（约定）**：

```json
[
  { "name": "realName", "label": "姓名", "type": "text", "required": true },
  { "name": "phone",    "label": "手机", "type": "tel",  "required": true, "pattern": "^1\\d{10}$" },
  { "name": "major",    "label": "意向专业", "type": "select", "options": ["计算机", "电子"] }
]
```

`type` ∈ `text` / `textarea` / `tel` / `email` / `number` / `date` / `select` / `radio` / `checkbox`。

### 5.6 User（用户管理）

**model**：`User`、`UserRole`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listUsers({ siteId?, role?, status?, keyword?, page, pageSize })` | — | `user.read` |
| SA | `createUser({ username, password, name, email?, role, siteId? })` | 用户名重复 → `CONFLICT`；`password` 服务端 bcrypt(10) 哈希（A29） | `user.manage` |
| SA | `updateUser({ id, name?, email?, role?, siteId?, status? })` | — | `user.manage` |
| SA | `resetPassword({ id, password })` | 服务端哈希 | `user.manage` |
| SA | `toggleUserStatus({ id, status })` | 停用后不允许登录 | `user.manage` |
| SA | `assignUserRole({ userId, roleId, siteId? })` | 写 `UserRole`；**同时同步 `User.role` 主角色** | `user.manage` |
| SA | `revokeUserRole({ userId, roleId })` | — | `user.manage` |

**返回禁止字段**：任何用户相关返回都**不得包含 `password`**（在 select 层排除，不靠前端过滤）。

### 5.7 Role / Permission / RBAC

**model**：`Role`、`Permission`、`RolePermission`、`UserRole`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listRoles({ siteId?, page, pageSize })` | — | `role.read` |
| SA | `listPermissions({ type?, group? })` | 按 `type`+`group` 分组返回，供勾选界面渲染 | `role.read` |
| SA | `getRolePermissions({ roleId })` | 返回已勾选的 `permissionId[]` | `role.read` |
| SA | `createRole({ name, code, siteId?, scope?, description? })` | `code` 重复 → `CONFLICT` | `role.manage` |
| SA | `updateRole({ id, name?, description?, scope?, status? })` | `isSystem=true` 的角色**禁止改 `code`** | `role.manage` |
| SA | `deleteRole({ id })` | `isSystem=true` → `FORBIDDEN`；有成员 → `IN_USE` | `role.manage` |
| SA | `setRolePermissions({ roleId, permissionIds[] })` | 事务内先删后插 `RolePermission` | `role.manage` |

### 5.8 Site（站点管理）

**model**：`Site`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listSites({ page, pageSize })` | — | `site.read` |
| SA | `createSite({ slug, name, domain?, template?, logo?, description? })` | `slug`/`domain` 重复 → `CONFLICT` | `site.manage` |
| SA | `updateSite({ id, ...字段 })` | — | `site.manage` |
| SA | `toggleSiteStatus({ id, status })` | — | `site.manage` |

### 5.9 Publish（定时发布）

**model**：`Article.publishTime`

**契约（不新增端点，复用 §5.1）**：

| 项 | 约定 |
|---|---|
| 设置定时 | `publishArticle({ id, publishTime })`，`publishTime` 为未来 UTC 时间 |
| 落库状态 | `status` **立即置为 `published`**，`publishTime` 存未来时间 |
| 前台可见条件 | `publishTime IS NULL OR publishTime <= now()`（见 §4.1 `GET /api/articles` 的固定过滤） |
| 后台"定时任务"列表 | `listArticles({ status: 'published', publishTimeFrom: now })` |
| 不采用 | 后台 cron / 队列 / 定时器（A1：不引入额外基础设施） |

> **这是刻意的简化**：不引入调度器，靠查询侧的时间过滤实现"到点可见"。代价是"到点"依赖请求触发（ISR 重校验时机），对作品集可接受。

### 5.10 Config（系统设置）

**model**：`Config`

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listConfigs({ group? })` | 按 `group` 分组返回，供 Tab 渲染 | `config.manage` |
| SA | `updateConfigs({ items: [{ key, value }] })` | 事务内逐条 upsert | `config.manage` |

**`group` 枚举**（`13` 缺口 13）：`seo` / `security` / `watermark` / `sensitive_words` / `site` / `general`
**本期只实现**：`seo`（TDK、sitemap 开关）、`site`（站名、备案号、联系方式、二维码）；其余分组保留但不做 UI（A18）。

### 5.11 Tags（标签）

**model**：`Article.tags`（JSON 字符串，**非独立表**）

> ⚠ **依赖未决项 Q5**：若决定改为标签表，本节契约需同步改为 `Tag` + `ArticleTag`。

| 类型 | 路径 | 入参 | 说明 |
|---|---|---|---|
| RH | `GET /api/tags?site=&limit=50` | — | 聚合该站点已发布文章的 `tags`，去重 + 计数，返回 `[{ name, count }]`，供**搜索框输入建议**（A25 中 Fuse.js 的数据源） |

**实现约束**：不做标签表、不做标签检索（`13` §4.2 已说明 `tags` 无索引）；`GET /api/articles?tag=` 用 `contains` 匹配，性能可接受（100 篇文章量级）。

### 5.12 Track（埋点）

> **本期不实现**（A26：接受"种子历史数据 + 不实时采集"）。此处仅登记占位，避免后续误以为遗漏。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/track` | **保留不实现**。若未来要做，契约约定为：`{ type: 'pv'\|'uv', path, siteId, referrer? }` → 按 `dateKey` upsert 累加 `Statistic` |

### 5.13 Audit（操作日志）

**model**：`Log`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `listLogs({ type?, userId?, dateFrom?, dateTo?, page, pageSize })` | — | `log.read` |
| RH | `POST /api/logs` | `{ type, action, detail? }`；`userId`/`ip` 由服务端填充，**不接受客户端传入** | `log.write` |

> **内容审核轨迹不走这里** —— 它在 `AuditRecord` 表，由 §5.1 的状态变更动作自动写入（C1）。`Log` 只记登录/操作/异常。

### 5.14 Recycle（回收站）

**model**：`Article`、`Page`、`Media`、`Comment`、`Attachment`（五者的 `deletedAt`）

| 类型 | 名称 | 入参 | 权限 |
|---|---|---|---|
| SA | `listRecycleBin({ entity, siteId?, page, pageSize })` | `entity` ∈ `article`/`page`/`media`/`comment`/`attachment`；查询 `deletedAt != null` | 各实体对应 `.delete` 权限 |
| SA | `restoreFromRecycle({ entity, id })` | 置 `deletedAt = null` | 同上 |
| SA | `purgeFromRecycle({ entity, id })` | **物理删除**（不可恢复）；有关联外键时按 `onDelete` 策略级联 | 同上 |
| SA | `emptyRecycleBin({ entity, siteId })` | 批量物理删除；返回删除条数 | 同上 |

### 5.15 Statistics（统计分析）

**model**：`Statistic`、`Article`、`Channel`

| 类型 | 名称 / 路径 | 入参 | 权限 |
|---|---|---|---|
| SA | `getDashboardStats({ siteId? })` | 站点数/文章数（按状态分组）/用户数/媒体数 | `statistics.read` |
| SA | `getVisitTrend({ siteId?, days = 90 })` | 返回 `[{ dateKey, pv, uv, ip }]`，**按 `dateKey` 聚合**（A32） | `statistics.read` |
| SA | `getSourceBreakdown({ siteId?, days = 90 })` | `[{ source, pv }]` | `statistics.read` |
| SA | `getArticleRanking({ siteId?, limit = 10 })` | 按 `viewCount` 倒序 | `statistics.read` |
| SA | `getChannelRanking({ siteId?, limit = 10 })` | 按栏目下文章数/总浏览量 | `statistics.read` |
| SA | `getTopSearchTerms({ limit = 10 })` | ⚠ **降级**：无埋点则无数据，返回 `[]` 并附 `degraded: true` 标志 | `statistics.read` |
| RH | `GET /api/statistics/views?site=&days=` | 同 `getVisitTrend`，供图表客户端调用 | 公开 |
| RH | `GET /api/statistics/articles?site=&limit=` | 同 `getArticleRanking` | 公开 |
| RH | `GET /api/statistics/channels?site=&limit=` | 同 `getChannelRanking` | 公开 |
| RH | `GET /api/statistics/sources?site=&days=` | 同 `getSourceBreakdown` | 公开 |

**"全站"数据的取法**：不存汇总行（`13` Q6 方案 A），`siteId` 省略时对 4 个站点的数据求和。

### 5.16 Search（全站搜索）

**model**：`Article`

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/search` | `site`（必填）、`q`（必填，长度 1~50）、`channel?`、`category?`、`page?`、`pageSize?` | 对 `title` + `content` 做 **Prisma `contains`**（A25），返回高亮片段 |

**返回**：`Ok<Paginated<SearchHit>>`，`SearchHit` 含：

```ts
{
  id, title, slug, summary,
  highlights: { title: string[], content: string[] },  // 命中片段，关键词用 <mark> 包裹
  channel: { name, slug },
  publishTime
}
```

**约束**：命中片段由服务端生成（避免把全文下发到前端）；`<mark>` 标签**在服务端安全拼接**，不返回原始 HTML（防 XSS）。

**不做**：PostgreSQL 全文检索、pg_trgm、中文分词、Elasticsearch、热搜词统计（A25）。

---

## 6. 文件与导出（Route Handler 细节）

### 6.1 上传

| 项 | 约定 |
|---|---|
| 路径 | `POST /api/media/upload` |
| 编码 | `multipart/form-data` |
| 字段 | `file`（File，必填）、`folder`（枚举）、`siteId`（可空） |
| 返回 | `Ok<Media>` |
| 幂等 | 不幂等（重复上传产生两条记录）；前端按 `name+size` 去重提示 |
| 生产注意 | Vercel 文件系统只读 → 必须走 `SupabaseStorageAdapter`（A33） |

### 6.2 导出

| 路径 | 入参 | 产出 | 权限 |
|---|---|---|---|
| `GET /api/export/articles?site=&status=` | 同 `listArticles` 的筛选（不含分页） | `.xlsx`（`Content-Disposition: attachment`） | `article.read` |
| `GET /api/export/form-data?formId=` | — | `.xlsx` | `form.manage` |
| `GET /api/export/statistics?site=&days=` | — | `.xlsx` | `statistics.read` |

**导出约束**：单次上限 **10000 行**（超出 → `VALIDATION_FAILED`，提示收窄筛选）；列名用中文表头；日期按 `Asia/Shanghai` 格式化（A32）。

### 6.3 重校验

| 路径 | 入参 | 说明 | 权限 |
|---|---|---|---|
| `POST /api/revalidate` | `{ path?: string, tag?: string }` | 调用 `revalidatePath` / `revalidateTag`；用于"发布后前台立即更新" | `config.manage` |

> **这是 A25"发稿后立刻可搜/可见"的技术保障之一**：发布动作（Server Action）内部可直接调用 `revalidatePath`，此端点用于手工兜底。

---

## 7. 权限码清单（`Permission.code`，供 §5 引用）

> 与 `13` 的 `Permission` 表对应，`type` 分三类（`menu` / `action` / `data`）。下表中前 14 个为 `menu`（菜单可见性），其余为 `action`。

| 分组 | `code` | 说明 |
|---|---|---|
| menu | `menu.dashboard` | 仪表盘 |
| menu | `menu.articles` | 内容管理 |
| menu | `menu.channels` | 栏目管理 |
| menu | `menu.media` | 媒体库 |
| menu | `menu.users` | 用户管理 |
| menu | `menu.roles` | 角色权限 |
| menu | `menu.sites` | 站点管理 |
| menu | `menu.audits` | 审核待办 |
| menu | `menu.forms` | 表单管理 |
| menu | `menu.comments` | 评论管理 |
| menu | `menu.messages` | 留言管理 |
| menu | `menu.statistics` | 统计分析 |
| menu | `menu.settings` | 系统设置 |
| menu | `menu.recycle` | 回收站 |
| action | `article.read` / `article.create` / `article.update` / `article.delete` | 文章 CRUD |
| action | `article.submit` / `article.audit` / `article.publish` / `article.withdraw` | 状态机四个动作 |
| action | `page.read` / `page.manage` | 单页 |
| action | `channel.read` / `channel.manage` | 栏目与导航 |
| action | `media.read` / `media.upload` / `media.manage` | 媒体 |
| action | `comment.manage` / `message.manage` | 互动 |
| action | `form.manage` | 表单 |
| action | `user.read` / `user.manage` | 用户 |
| action | `role.read` / `role.manage` | 角色权限 |
| action | `site.read` / `site.manage` | 站点 |
| action | `statistics.read` | 统计 |
| action | `config.manage` | 系统设置 |
| action | `log.read` / `log.write` | 日志 |
| data | `data.site_scoped` | 数据范围：仅本站（`site_admin`/`editor`/`auditor`） |
| data | `data.own_only` | 数据范围：仅本人稿件（`editor`，对应约束 C4） |
| data | `data.global` | 数据范围：全站（`super_admin`） |

**四个系统角色的权限矩阵**（seed 依据；**矩阵即在本节**，`13` §6 只说"按角色矩阵生成"、不给可执行集合）：

| 角色 | `data.*` | 关键 `action.*` |
|---|---|---|
| `super_admin` | `data.global` | 全部 |
| `site_admin` | `data.site_scoped` | 本站全部（含 `article.publish`/`withdraw`）；**排除 `role.manage` / `user.manage`**（依 `16` §2.3；T1.9 起 seed 已对齐 → RolePermission 总数 **105**） |
| `editor` | `data.own_only` | `article.create`/`update`/`submit`/`delete`、`media.upload`；**无** `audit`/`publish`/`withdraw` |
| `auditor` | `data.site_scoped` | `article.read`/`audit`/`publish`/`withdraw`、`comment.manage`；**无** `article.create` |

---

## 8. 未决问题（✅ 全部已结案，2026-10-01）

> 7 条问题已由决策者一次性裁决，逐条结论如下。原"建议"列一并保留，供追溯。

| # | 问题 | 裁决 | 落地位置 |
|---|---|---|---|
| **A1** | `tags` 用 JSON 字符串还是标签表 | ✅ **保持 JSON 字符串，不建表**。理由：无标签检索需求 | §5.11 契约**不变**；`13` Q5 同步结案 |
| **A2** | `Channel.type='form'` 的表单入口是否本期做 | ✅ **本期只做：schema（已建）+ 后台数据查看 + 导出**。**不做**前台拖拽设计器、**不做**前台表单渲染。理由：作品集不需要，第 5 周再说 | §5.5 需按此**收窄**（见下方 A2 细化）；§5.3 `Channel.formId` 保留但不渲染 |
| **A3** | `getTopSearchTerms` 无数据源 | ✅ **返回空数组 + `degraded: true`**，UI 显示"暂无数据" | §5.15 已按此写 |
| **A4** | 导出用 `.xlsx` 还是 `.csv` | ✅ **用 `.xlsx`**。理由：csv 中文乱码，xlsx 是 Excel 原生格式。**依赖库 `exceljs` 或 `sheetjs`，T1.1 装依赖时再选定** | §6.2 需补依赖待定说明 |
| **A5** | `/api/logs` 的写入时机 | ✅ **只写关键操作**：登录、登出、删除、审核通过/退回、权限变更、配置变更。**不做全量操作日志**。理由：作品集不需要完整审计 | §5.13 需按此收敛 |
| **A6** | 附件是否允许独立于文章上传 | ✅ **允许先传后挂**。媒体库先上传，文章编辑时选择。理由：这是 CMS 标准流程 | §5.3 已按此写（`articleId` 可空） |
| **A7** | 公开接口的站点校验方式 | ✅ **不暴露 `siteId` 列表**；公开接口**只接受 site slug**，通过 slug 查站点；**校验失败返回 404 而非 403**（避免探测） | §4.1 与 §5 各公开接口统一按此 |

### A2 细化：本期表单能力的边界

| 能力 | 本期 | 说明 |
|---|---|---|
| `Form` / `FormData` schema | ✅ 已有 | `13` 缺口 1~14 已建 |
| 后台表单列表（`listForms`） | ✅ 做 | 查看名称、字段定义、状态 |
| 后台数据查看（`listFormData`） | ✅ 做 | 列表 + 详情 + 标记 `new`/`read`/`archived` |
| 导出（`/api/export/form-data`） | ✅ 做 | `.xlsx`（A4） |
| 创建/编辑表单定义（`createForm`/`updateForm`） | ⚠ **不做 UI** | 契约保留；seed 直接生成 3 个表单 |
| 前台表单渲染（`Channel.type='form'`） | ❌ **不做** | `Channel.formId` 保留字段但前台不渲染 |
| 拖拽式设计器 | ❌ **不做** | 作品集不需要 |
| 公开提交端点 `/api/forms/[id]/submit` | ❌ **不做** | 无前台渲染则无提交入口；契约保留待第 5 周 |

> **对 `03-功能范围` 的影响**：`03` 的 P1 清单中"表单引擎"本期实际降为 **P2（仅后台查看与导出）**，`16-范围清单` 需据此调整。

### A5 细化：关键操作的清单（`Log.type` 取值）

| `type` | 触发动作 | 记录字段 |
|---|---|---|
| `login` | 登录成功 / 失败 | `userId?`、`username`、`ip`、`action="login"`、`detail` = 成功/失败原因 |
| `login` | 登出 | 同上，`action="logout"` |
| `operation` | 删除（软删/彻底删） | `action="delete"`，`detail` = 实体类型 + id |
| `audit` | 审核通过 / 退回 | `action="approve"`/`"reject"`；**注意**：审核的完整轨迹在 `AuditRecord`，`Log` 只记"发生过一次审核动作" |
| `operation` | 权限变更（角色增删改、授权变更、用户角色分配） | `action="permission.change"` |
| `operation` | 配置变更（`updateConfigs`） | `action="config.change"`，`detail` = 变更的 key 列表 |
| `error` | 未预期异常（服务端捕获） | `action` = 异常摘要 |

**明确不记录**：查看列表、查看详情、普通编辑保存、搜索、导出（量太大且无价值）。

---

## 9. 验收对照

| 标准（本次指令） | 结论 |
|---|---|
| 覆盖所有后台页面的数据入口 | ✅ §3 对照表：**15 行**（14 个菜单页面 + 单页 + 回收站） |
| 覆盖指定模块清单 | ✅ users/roles/permissions/sites/pages/navigation/comments/messages/config/versions/recycle/publish/track/tags + articles/channels/media/search/audits/statistics/forms |
| Server Action vs Route Handler 边界 | ✅ §1：3 条判断规则 + 4 类归口，未逐条列举 |
| 统一约定（错误码/分页/鉴权/返回） | ✅ §2.1~§2.5 |
| 每个 API 标注方法/路径/入参/返回/权限/model | ✅ §4~§5 |
| 不写实现 | ✅ 全文无代码实现，仅函数签名、JSON 形状与约束 |

---

## 10. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-01 | 首次发布。定义 3 条边界规则、**14 个错误码**、分页与三层鉴权约定；覆盖 **21 个公开端点** + 7 个受保护端点 + 2 个 MetadataRoute；按 16 个领域给出 Server Action 与 Route Handler 契约；补权限码清单（14 menu + **28 action** + 3 data）与四个系统角色矩阵 ｜ 注：原文写「13 个错误码 / 20 个公开端点 / 40 action」，T1.10 按 §2.2、§4.1、§7 实数修正（见 `00` §8 #17/#18/#20） |
| v1.1 | 2026-10-01 | **§8 的 7 条未决问题全部结案**：A1 tags 保持 JSON 字符串；A2 表单本期只做"schema + 后台查看 + 导出"（不做前台渲染与设计器），并给出细化边界表；A3 热搜词返回空数组 + `degraded`；A4 导出用 `.xlsx`（依赖 `exceljs`/`sheetjs` 待 T1.1 选定）；A5 日志只记 7 类关键操作（补 `Log.type` 收敛表）；A6 附件允许先传后挂；A7 公开接口只接受 site slug、失败返 404 防探测 |
