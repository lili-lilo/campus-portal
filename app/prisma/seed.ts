/**
 * Prisma seed —— T1.5
 * ============================================================================
 * 执行：`pnpm db:seed`（即 `prisma db seed`，由 prisma.config.ts 的 migrations.seed 指向）
 * 权威来源：docs/13-数据模型-v2.md §6 / §6.1 / §6.2 / §5.3；docs/10-种子数据说明.md
 * 幂等：全部写入走 upsert，确定性键见 docs/13 §6 表；无自然唯一键的模型用固定 id `seed-<model>-<n>`
 *
 * 本文件遵循的 5 条 T1.5 硬约束：
 *   1. 不装包（bcryptjs / tsx 已装）
 *   2. 幂等：所有写入 upsert；重复执行不改动已有行
 *   3. 密码：bcryptjs.hashSync(pwd, 10)，11 个账号统一 admin123
 *   4. slug 黑名单断言（修订版，见下）
 *   5. 时间字段一律「固定基准 + 确定性偏移」，不用 new Date() / Date.now() / Math.random()
 *
 * ── 三处已裁决的规格偏离（用户 2026-10-02 裁决，另有 docs 回写） ──────────────
 *  A. 保留 slug：docs/15 §4.1 原禁全部 10 个保留 slug 用作 Channel.slug，但 §6 的静态
 *     路由又按 {channel:'news'} 取数 → 二者不可兼得。裁决：seed **允许** 8 个已被静态
 *     路由占用的 slug（news / notice / about / departments / faculty / admissions /
 *     research / disclosure），**search / sitemap 仍禁止**；断言按此白名单实现。
 *     后台新建栏目的规则不变（仍拒全部黑名单）。
 *  B. `Media.path` / `Form.name` / `Attachment(articleId,fileName)` 三个「规格规定」的
 *     upsert 键在 schema 里**没有唯一索引**（Prisma 的 upsert.where 只接受唯一过滤器），
 *     故这三个模型改用固定 id（`seed-media-1` / `seed-form-1` / `seed-attach-1`）。
 *  C. `Permission` 按 docs/14 §7 全量 **45** 条（14 menu + 28 action + 3 data）种，
 *     而非 docs/13 §6 的「约 20」；RolePermission 按 docs/14 §7 的四角色矩阵生成，
 *     并按 docs/16 §2.3 收窄 site_admin（排除 `role.manage` / `user.manage`）→ 总数 105。
 *
 * ── 一处「约值」的实现口径（docs 只给约数，此处定死以便复现）─────────────────
 *   · 文章：主站 60 / cs 14 / ee 13 / ba 13；状态 published 80 / pending_first 6 /
 *     pending_final 4 / draft 4 / rejected 3 / withdrawn 3（= docs/13 §6.2 说明段）
 *   · ArticleVersion 120 = 80 篇 published 各 1 版 + 前 40 篇各加第 2 版
 *   · AuditRecord 152 = 非 published 轨迹 32 条 + 前 40 篇 published 各 3 步（120）
 *   · Statistic 360 = 90 天 × 4 站点，pv/uv/ip 由 dateKey+站点 slug 的确定性哈希派生
 */

import bcrypt from "bcryptjs";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
// T1.9：保留 slug 规则与 dateKey 的**唯一实现**已抽到 src/lib，seed 只做调用方。
// 用**相对路径**导入（seed 由 tsx 运行，tsx 不读 tsconfig 的 paths 别名）。
import { dateKeyOf } from "../src/lib/date";
import { assertSlugAllowedForSeed } from "../src/lib/slug";

// ---------------------------------------------------------------------------
// 基础工具（全部确定性）
// ---------------------------------------------------------------------------

/** 固定基准时间（UTC）：所有 createdAt / updatedAt 都从它派生 */
const BASE = new Date("2026-10-01T00:00:00Z");

/** 基准 + 偏移（天/小时/分钟），负值表示更早 */
function shift(days: number, hours = 0, minutes = 0): Date {
  return new Date(BASE.getTime() + (days * 24 * 60 + hours * 60 + minutes) * 60_000);
}

/** 确定性 32 位哈希（FNV-1a），替代 Math.random */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 从数组里确定性取一项 */
function pick<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length] as T;
}

/** JSON 字符串字段（tags / fields / data） */
function json(value: unknown): string {
  return JSON.stringify(value);
}

/** 统计每张表的写入条数，供末尾汇总输出 */
const counts = new Map<string, number>();
function count(model: string, n: number): void {
  counts.set(model, n);
}

// ---------------------------------------------------------------------------
// Prisma 客户端（Prisma 7：从生成路径导入 + 显式传驱动适配器）
// ---------------------------------------------------------------------------

// seed 是一次性脚本：走**直连**串更稳（pooler 不支持会话级操作，见 docs/11 A31）
// 连接池配置与 src/lib/prisma.ts 对齐（直连同样会被服务端回收空闲连接）
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  max: 10,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 15_000,
});

const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// 静态数据表
// ---------------------------------------------------------------------------

// T1.9：保留 slug 的黑名单（10）与 seed 白名单（8）已抽到 `src/lib/slug.ts`（唯一实现），
// 本文件不再内联，只调用 `assertSlugAllowedForSeed()`。

/** 栏目定义：主站 8 顶级（about 另带 4 子栏目）+ 子站各 6 */
type ChannelSeed = {
  slug: string;
  name: string;
  /** 英文名（M5-1 / docs/00 §8 #58）；前台英文站取它，空则回退 `name` */
  nameEn?: string;
  type: "list" | "page" | "link" | "form";
  parentSlug?: string;
  description?: string;
  template?: string;
};

const MAIN_CHANNELS: readonly ChannelSeed[] = [
  {
    slug: "about",
    name: "学校概况",
    nameEn: "About",
    type: "page",
    description: "学校简介、历史沿革、现任领导与组织机构",
  },
  {
    slug: "news",
    name: "新闻中心",
    nameEn: "News",
    type: "list",
    description: "学校要闻与综合新闻",
  },
  {
    slug: "notice",
    name: "通知公告",
    nameEn: "Notices",
    type: "list",
    description: "学校通知与公告",
  },
  {
    slug: "departments",
    name: "院系设置",
    nameEn: "Schools & Departments",
    type: "list",
    description: "教学与科研机构",
  },
  {
    slug: "faculty",
    name: "师资队伍",
    nameEn: "Faculty",
    type: "list",
    description: "师资队伍与人才引进",
  },
  {
    slug: "admissions",
    name: "招生就业",
    nameEn: "Admissions & Careers",
    type: "list",
    description: "本科、研究生招生与就业服务",
  },
  {
    slug: "research",
    name: "科学研究",
    nameEn: "Research",
    type: "list",
    description: "科研动态与学术成果",
  },
  {
    slug: "disclosure",
    name: "信息公开",
    nameEn: "Disclosure",
    type: "list",
    description: "信息公开与年度报告",
  },
  { slug: "history", name: "历史沿革", nameEn: "History", type: "page", parentSlug: "about" },
  { slug: "leaders", name: "现任领导", nameEn: "Leadership", type: "page", parentSlug: "about" },
  {
    slug: "organization",
    name: "组织机构",
    nameEn: "Organization",
    type: "page",
    parentSlug: "about",
  },
  { slug: "contact", name: "联系我们", nameEn: "Contact Us", type: "page", parentSlug: "about" },
];

const SUB_CHANNELS: readonly ChannelSeed[] = [
  {
    slug: "about",
    name: "学院概况",
    nameEn: "About the School",
    type: "page",
    description: "学院简介与联系方式",
    template: "department",
  },
  {
    slug: "news",
    name: "新闻动态",
    nameEn: "News",
    type: "list",
    description: "本院新闻与通知",
  },
  {
    slug: "faculty",
    name: "师资队伍",
    nameEn: "Faculty",
    type: "list",
    description: "本院师资与研究方向",
  },
  {
    slug: "programs",
    name: "专业介绍",
    nameEn: "Programs",
    type: "list",
    description: "本科与研究生专业",
  },
  {
    slug: "research",
    name: "科研成果",
    nameEn: "Research",
    type: "list",
    description: "科研项目与成果",
  },
  {
    slug: "contact",
    name: "联系方式",
    nameEn: "Contact",
    type: "page",
    description: "办公地点与联系电话",
  },
];

/** 文档写「7 个」（实际列出 8 个），此处以列出的 8 个为准并记录 */
/** 站点定义（4 个演示站点；`nameEn` / `descriptionEn` = M5-1b-1 / docs/00 §8 #58 的英文站文案） */
type SiteSeed = {
  slug: string;
  name: string;
  nameEn?: string;
  template: string;
  description: string;
  descriptionEn?: string;
};

const SITES: readonly SiteSeed[] = [
  {
    slug: "main",
    name: "明德大学",
    nameEn: "MINGDE UNIVERSITY",
    template: "default",
    description: "明德大学官方网站",
    descriptionEn: "Official website of MINGDE UNIVERSITY",
  },
  {
    slug: "cs",
    name: "计算机学院",
    nameEn: "School of Computer Science",
    template: "department",
    description: "明德大学计算机学院",
    descriptionEn: "School of Computer Science, MINGDE UNIVERSITY",
  },
  {
    slug: "ee",
    name: "电子信息学院",
    nameEn: "School of Electronic Information",
    template: "department",
    description: "明德大学电子信息学院",
    descriptionEn: "School of Electronic Information, MINGDE UNIVERSITY",
  },
  {
    slug: "ba",
    name: "商学院",
    nameEn: "Business School",
    template: "department",
    description: "明德大学商学院",
    descriptionEn: "Business School, MINGDE UNIVERSITY",
  },
] as const;

/** docs/13 §6.1：11 个账号（4 演示 + 7 扩展） */
const USERS = [
  { username: "admin", name: "系统管理员", role: "super_admin", site: null },
  { username: "site_admin", name: "主站管理员", role: "site_admin", site: "main" },
  { username: "editor", name: "主站编辑", role: "editor", site: "main" },
  { username: "auditor", name: "主站审核员", role: "auditor", site: "main" },
  { username: "site_ba", name: "商学院管理员", role: "site_admin", site: "ba" },
  { username: "site_cs", name: "计算机学院管理员", role: "site_admin", site: "cs" },
  { username: "site_ee", name: "电子信息学院管理员", role: "site_admin", site: "ee" },
  { username: "editor2", name: "计算机学院编辑", role: "editor", site: "cs" },
  { username: "editor3", name: "电子信息学院编辑", role: "editor", site: "ee" },
  { username: "auditor2", name: "计算机学院审核员", role: "auditor", site: "cs" },
  { username: "editor4", name: "商学院编辑", role: "editor", site: "ba" },
] as const;

const DEMO_PASSWORD = "admin123";

/** docs/13 §6：4 个系统角色 */
const ROLES = [
  {
    code: "super_admin",
    name: "超级管理员",
    scope: "global",
    description: "全部权限；siteId 为 null（全局）",
  },
  {
    code: "site_admin",
    name: "站点管理员",
    scope: "site",
    description: "本站全部权限（含发布/撤稿）",
  },
  {
    code: "editor",
    name: "栏目编辑",
    scope: "channel",
    description: "仅本人稿件；无审核/发布/撤稿",
  },
  { code: "auditor", name: "审核员", scope: "site", description: "本站审核与发布；无创建权限" },
] as const;

/** docs/14 §7：45 条权限码（14 menu + 28 action + 3 data） */
type PermissionSeed = {
  code: string;
  name: string;
  type: "menu" | "action" | "data";
  group: string;
};

const MENU_PERMISSIONS: readonly PermissionSeed[] = [
  { code: "menu.dashboard", name: "仪表盘", type: "menu", group: "menu" },
  { code: "menu.articles", name: "内容管理", type: "menu", group: "menu" },
  { code: "menu.channels", name: "栏目管理", type: "menu", group: "menu" },
  { code: "menu.media", name: "媒体库", type: "menu", group: "menu" },
  { code: "menu.users", name: "用户管理", type: "menu", group: "menu" },
  { code: "menu.roles", name: "角色权限", type: "menu", group: "menu" },
  { code: "menu.sites", name: "站点管理", type: "menu", group: "menu" },
  { code: "menu.audits", name: "审核待办", type: "menu", group: "menu" },
  { code: "menu.forms", name: "表单管理", type: "menu", group: "menu" },
  { code: "menu.comments", name: "评论管理", type: "menu", group: "menu" },
  { code: "menu.messages", name: "留言管理", type: "menu", group: "menu" },
  { code: "menu.statistics", name: "统计分析", type: "menu", group: "menu" },
  { code: "menu.settings", name: "系统设置", type: "menu", group: "menu" },
  { code: "menu.recycle", name: "回收站", type: "menu", group: "menu" },
];

const ACTION_PERMISSIONS: readonly PermissionSeed[] = [
  { code: "article.read", name: "查看文章", type: "action", group: "article" },
  { code: "article.create", name: "新建文章", type: "action", group: "article" },
  { code: "article.update", name: "编辑文章", type: "action", group: "article" },
  { code: "article.delete", name: "删除文章", type: "action", group: "article" },
  { code: "article.submit", name: "提交初审", type: "action", group: "article" },
  { code: "article.audit", name: "审核文章", type: "action", group: "article" },
  { code: "article.publish", name: "发布文章", type: "action", group: "article" },
  { code: "article.withdraw", name: "撤稿下架", type: "action", group: "article" },
  { code: "page.read", name: "查看单页", type: "action", group: "page" },
  { code: "page.manage", name: "管理单页", type: "action", group: "page" },
  { code: "channel.read", name: "查看栏目", type: "action", group: "channel" },
  { code: "channel.manage", name: "管理栏目与导航", type: "action", group: "channel" },
  { code: "media.read", name: "查看媒体", type: "action", group: "media" },
  { code: "media.upload", name: "上传媒体", type: "action", group: "media" },
  { code: "media.manage", name: "管理媒体", type: "action", group: "media" },
  { code: "comment.manage", name: "管理评论", type: "action", group: "comment" },
  { code: "message.manage", name: "管理留言", type: "action", group: "message" },
  { code: "form.manage", name: "管理表单", type: "action", group: "form" },
  { code: "user.read", name: "查看用户", type: "action", group: "user" },
  { code: "user.manage", name: "管理用户", type: "action", group: "user" },
  { code: "role.read", name: "查看角色", type: "action", group: "role" },
  { code: "role.manage", name: "管理角色权限", type: "action", group: "role" },
  { code: "site.read", name: "查看站点", type: "action", group: "site" },
  { code: "site.manage", name: "管理站点", type: "action", group: "site" },
  { code: "statistics.read", name: "查看统计", type: "action", group: "statistics" },
  { code: "config.manage", name: "管理系统设置", type: "action", group: "config" },
  { code: "log.read", name: "查看日志", type: "action", group: "log" },
  { code: "log.write", name: "写入日志", type: "action", group: "log" },
];

const DATA_PERMISSIONS: readonly PermissionSeed[] = [
  { code: "data.site_scoped", name: "数据范围：仅本站", type: "data", group: "data" },
  { code: "data.own_only", name: "数据范围：仅本人稿件", type: "data", group: "data" },
  { code: "data.global", name: "数据范围：全站", type: "data", group: "data" },
];

const PERMISSIONS: readonly PermissionSeed[] = [
  ...MENU_PERMISSIONS,
  ...ACTION_PERMISSIONS,
  ...DATA_PERMISSIONS,
];

/**
 * 四角色权限矩阵（docs/14 §7）。§7 的「关键 action」列是硬约束，菜单与其余 action
 * 按角色可访问的后台页面推导（此处显式写死，便于后台"角色权限"页直接展示）。
 */
const ROLE_MATRIX: Record<
  string,
  { menus: readonly string[]; actions: readonly string[]; data: readonly string[] }
> = {
  super_admin: {
    menus: MENU_PERMISSIONS.map((p) => p.code),
    actions: ACTION_PERMISSIONS.map((p) => p.code),
    data: ["data.global"],
  },
  site_admin: {
    menus: MENU_PERMISSIONS.map((p) => p.code),
    // T1.9 收窄：docs/16 §2.3 规定 `role.manage` / `user.manage` **仅** `super_admin` 可用
    // → site_admin 由 43 条（全 28 个 action）降为 41 条；RolePermission 总数 107 → 105。
    actions: ACTION_PERMISSIONS.map((p) => p.code).filter(
      (code) => code !== "role.manage" && code !== "user.manage",
    ),
    data: ["data.site_scoped"],
  },
  editor: {
    menus: ["menu.dashboard", "menu.articles", "menu.media"],
    actions: [
      "article.read",
      "article.create",
      "article.update",
      "article.delete",
      "article.submit",
      "media.read",
      "media.upload",
    ],
    data: ["data.own_only"],
  },
  auditor: {
    menus: ["menu.dashboard", "menu.audits", "menu.comments"],
    actions: [
      "article.read",
      "article.audit",
      "article.publish",
      "article.withdraw",
      "comment.manage",
      "message.manage",
    ],
    data: ["data.site_scoped"],
  },
};

/** 文章状态机（docs/13 §7.2）：每条边 = [step, fromStatus, toStatus, 执行角色] */
const STATE_EDGES = {
  submit: { step: "submit", from: "draft", to: "pending_first", role: "editor" },
  review: { step: "review", from: "pending_first", to: "pending_final", role: "auditor" },
  publish: { step: "publish", from: "pending_final", to: "published", role: "site_admin" },
  rejectFirst: { step: "reject", from: "pending_first", to: "rejected", role: "auditor" },
  rejectFinal: { step: "reject", from: "pending_final", to: "rejected", role: "auditor" },
  withdraw: { step: "withdraw", from: "published", to: "withdrawn", role: "site_admin" },
} as const;

/** 文章分类分布（docs/10 §4）：30/20/15/15/10/10 = 100 */
const ARTICLE_CATEGORIES = [
  { name: "学校要闻", count: 30, mainChannel: "news" },
  { name: "通知公告", count: 20, mainChannel: "notice" },
  { name: "学术活动", count: 15, mainChannel: "news" },
  { name: "招生就业", count: 15, mainChannel: "admissions" },
  { name: "科研动态", count: 10, mainChannel: "research" },
  { name: "校园文化", count: 10, mainChannel: "news" },
] as const;

/* ---------------------------------------------------------------------------
 * 文章内容池（M6 内容重写）
 * ---------------------------------------------------------------------------
 * ⚠ 合规：下列机构名 / 活动名 / 竞赛名**全部为虚构**——本项目是技术演示作品集，
 *    不指名任何真实单位（部委、地方教育行政部门、真实高校、真实企业）。
 * 结构：每分类 3 个标题模板 + 18~25 个词池条目 ⇒ 组合出 100 条不重样的标题；
 *       摘要 = 标题 + 分类尾句（合计 40~60 字）；正文 = 摘要 + 主体段 + 结尾长段（4 段）。
 * ------------------------------------------------------------------------- */

/** 标题模板池：每分类 3 个（{key} 由词池填充，{n} 为序数） */
const TITLE_TEMPLATES: Record<string, readonly string[]> = {
  学校要闻: [
    "明德大学与{org}签署战略合作协议",
    "明德大学举行{year}级本科生开学典礼",
    "明德大学召开{theme}工作会议",
  ],
  通知公告: ["关于{event}的通知", "关于公布{result}的公示", "{term}放假安排通知"],
  学术活动: [
    "{theme}前沿论坛在我校举行",
    "第{n}届{subject}青年学者论坛征稿",
    "{subject}国际学术研讨会成功召开",
  ],
  招生就业: [
    "明德大学{year}年本科招生章程发布",
    "第{n}届毕业生秋季双选会举行",
    "明德大学{subject}专业获批一流本科专业建设点",
  ],
  科研动态: ["我校团队在{field}取得新进展", "{project}启动会召开", "我校{n}项成果获{award}"],
  校园文化: [
    "第{n}届校园文化艺术节开幕",
    "我校学子在{contest}中获佳绩",
    "明德大学{activity}活动圆满结束",
  ],
};

/** 词池：每分类 18~25 条（虚构机构 / 学科 / 活动 / 竞赛；不含任何真实单位名） */
const TITLE_WORDS: Record<string, Record<string, readonly string[]>> = {
  学校要闻: {
    org: [
      "云岚智能科技集团",
      "海岳新材料研究院",
      "启明数字技术有限公司",
      "远洋能源科技集团",
      "青麓医疗科技有限公司",
      "星野环保工程集团",
      "长风装备制造有限公司",
      "沐光生物技术研究院",
      "瀚宇数据科技有限公司",
      "东篱文化传媒有限公司",
      "北辰海洋工程研究院",
      "川岳交通科技集团",
      "青柏教育科技有限公司",
      "澄川生物制药有限公司",
      "南屿建筑设计研究院",
      "澜山数字传媒集团",
      "白鹿精密仪器有限公司",
      "禾风农业发展集团",
    ],
    year: ["2026", "2027", "2028"],
    theme: [
      "学科建设",
      "人才培养",
      "科研工作",
      "国际合作",
      "就业创业",
      "实验室安全",
      "教学改革",
      "数字化建设",
      "师资队伍",
      "学科评估",
      "创新创业",
      "校园安全",
      "后勤保障",
      "招生宣传",
    ],
  },
  通知公告: {
    event: [
      "开展本学年期中教学检查",
      "做好毕业生就业推荐工作",
      "组织申报校级教学改革项目",
      "开展实验室安全专项检查",
      "做好新学期学生返校报到工作",
      "开展校园网络设备维护",
      "组织教师教学能力培训",
      "开展图书文献资源需求征集",
      "做好科研项目中期检查",
      "开展校园绿化提升工程",
    ],
    result: [
      "校级教学成果奖评审结果",
      "一流本科课程认定结果",
      "优秀指导教师评选结果",
      "学生科研训练计划立项结果",
      "校园文化精品项目评选结果",
      "优秀毕业生推荐名单",
      "实验室建设立项结果",
      "教师教学竞赛获奖名单",
    ],
    term: [
      "2026 年国庆节",
      "2027 年元旦",
      "2026 年寒假",
      "2027 年清明节",
      "2027 年劳动节",
      "2027 年端午节",
    ],
  },
  学术活动: {
    theme: [
      "智能材料与结构",
      "人工智能与医疗健康",
      "碳中和与新能源",
      "空天信息与遥感",
      "量子计算与密码学",
      "生物医学工程",
      "数字人文与计算传播",
      "先进制造与增材技术",
      "城市更新与智慧交通",
      "数据安全与隐私计算",
    ],
    subject: [
      "材料科学",
      "计算机科学",
      "应用数学",
      "环境工程",
      "生物技术",
      "经济管理",
      "电子工程",
      "化学工程",
      "土木工程",
      "外国语学",
    ],
  },
  招生就业: {
    year: ["2026", "2027", "2028"],
    subject: [
      "计算机科学与技术",
      "电子信息工程",
      "材料科学与工程",
      "工商管理",
      "环境工程",
      "生物医学工程",
      "数据科学与大数据技术",
      "会计学",
      "应用化学",
      "机械设计制造及其自动化",
      "英语",
      "网络空间安全",
      "软件工程",
      "自动化",
      "金融学",
      "新闻学",
      "高分子材料与工程",
      "智能建造",
    ],
  },
  科研动态: {
    field: [
      "固态电解质材料",
      "工业视觉缺陷检测",
      "高效光伏器件",
      "微流控芯片",
      "智能交通调度",
      "稀有金属回收",
      "肿瘤早期筛查",
      "城市碳排放核算",
      "海洋腐蚀防护",
      "柔性可穿戴传感",
      "农业面源污染治理",
      "大规模图计算",
    ],
    project: [
      "国家重大科技专项「智能感知与边缘计算」项目",
      "省部级重点研发计划「绿色低碳材料」项目",
      "校级交叉学科培育项目「数字人文与遗产保护」",
      "国家自然科学基金重点项目「先进储能材料」",
      "省部级科技攻关项目「工业软件与数字孪生」",
      "校级重大培育项目「海洋工程装备与防腐」",
      "国家重大科技专项「生物医用材料」项目",
      "省部级重点研发计划「智慧农业与农机装备」项目",
    ],
    award: [
      "校级教学成果奖",
      "行业协会科技进步奖",
      "学会优秀成果奖",
      "校级优秀科研团队奖",
      "产学研合作创新奖",
    ],
  },
  校园文化: {
    contest: [
      "全国大学生智慧城市设计竞赛",
      "大学生程序设计邀请赛",
      "全国大学生绿色能源创新大赛",
      "大学生数学建模邀请赛",
      "全国大学生机器人大赛",
      "大学生网络安全挑战赛",
      "全国大学生市场调查与分析大赛",
      "大学生化学实验创新设计大赛",
      "全国大学生结构设计竞赛",
      "大学生外语演讲大赛",
    ],
    activity: [
      "校园读书节",
      "志愿服务周",
      "科技创新月",
      "体育文化节",
      "非遗进校园",
      "心理健康教育月",
      "师生书画展",
      "校园歌手大赛",
    ],
  },
};

/** 摘要尾句（每分类 5 条）——与标题拼成 40~60 字导语 */
const SUMMARY_TAILS: Record<string, readonly string[]> = {
  学校要闻: [
    "双方将围绕人才培养、科研攻关与成果转化开展长期合作。",
    "校领导在讲话中勉励同学们打好基础、保持好奇、勇于探索。",
    "会议明确了下一阶段重点任务、责任分工与时间节点。",
    "本次活动为师生了解行业前沿与职业发展提供了窗口。",
    "学校将进一步完善相关机制，推动各项工作落地见效。",
  ],
  通知公告: [
    "请各单位按要求组织落实，并于规定时间内完成材料报送。",
    "相关结果现予公示，公示期为五个工作日，逾期不再受理异议。",
    "假期期间请做好值班安排与安全巡查，确保校园秩序稳定。",
    "具体办理流程与所需材料详见附件，如有疑问请联系相关部门。",
    "请相关师生及时关注系统通知，避免影响正常教学与办事安排。",
  ],
  学术活动: [
    "活动由明德大学相关学院承办，校内外百余名师生参加。",
    "与会学者围绕关键科学问题展开深入讨论，现场交流气氛热烈。",
    "论坛设置主题报告与圆桌对话环节，并面向青年学者征集论文。",
    "本次研讨为相关学科搭建了稳定的学术交流与合作平台。",
    "会议同期举办了海报展示与实验室参观活动。",
  ],
  招生就业: [
    "学校持续完善招生与就业服务体系，为考生和毕业生提供更便捷的对接渠道。",
    "本次双选会共有百余家用人单位参加，提供岗位两千余个。",
    "该专业将以此为契机，进一步优化课程体系与实践教学环节。",
    "招生政策与录取规则以学校正式发布的文件为准。",
    "就业指导中心将同步开展简历诊断与模拟面试等配套服务。",
  ],
  科研动态: [
    "相关成果已发表于国际学术期刊，并获得同行专家的积极评价。",
    "项目将围绕关键科学问题开展系统研究，力争形成原创性突破。",
    "学校将持续加大科研平台与团队建设投入，营造良好的创新生态。",
    "研究成果为相关产业的技术升级提供了新的思路与实验依据。",
    "下一步团队将开展中试验证，推动成果向实际应用转化。",
  ],
  校园文化: [
    "活动吸引了众多师生参与，充分展现了校园文化的活力与创造力。",
    "参赛同学在指导教师带领下完成了多轮方案迭代与现场答辩。",
    "本次活动既丰富了课余生活，也促进了不同学科同学的交流。",
    "学校将持续打造校园文化品牌，为学生提供更多展示平台。",
    "现场还设置了互动体验环节，吸引不少师生驻足参与。",
  ],
};

/** 正文主体段（每分类 3 个变体；配合「摘要 + 主体段 + 结尾长段」构成 4 段正文） */
const CONTENT_BODIES: Record<string, readonly string[]> = {
  学校要闻: [
    "签约仪式在校行政楼会议室举行。双方代表分别介绍了各自发展情况与优势领域，并围绕人才培养、联合攻关与实习实践基地建设等议题充分交流，明确建立常态化沟通机制，每年确定一批具体合作事项，推动资源共享与优势互补。",
    "典礼在庄严的国歌声中开始。校领导为新生代表佩戴校徽并致辞，教师代表、在校生代表与新生代表先后发言，分享了对大学学习与生活的理解。随后，全体新生进行入学宣誓，并参加了入学教育第一课。",
    "会议由分管校领导主持，相关部门负责人汇报了近期工作进展与存在问题。与会人员围绕重点任务、时间节点与保障措施展开讨论，形成明确分工方案，并对下一阶段督促检查与信息报送工作作出安排。",
  ],
  通知公告: [
    "本次工作由学校相关职能部门统一组织，各学院（单位）按属地原则具体落实。请各单位明确责任人与联系人，按要求建立工作台账，并在规定时间内完成自查与材料报送；学校将组织抽查，抽查结果纳入年度考核。",
    "评审工作按照公开、公平、公正的原则组织，经个人申报、单位推荐、专家评审等环节形成结果。公示期内如有异议，请以书面形式实名反映并提供必要证明材料；匿名或逾期反映不予受理。",
    "假期期间，各单位要严格落实值班制度，做好实验室、危化品库与学生宿舍等重点部位的安全巡查，确保水电暖供应与食堂营业时间正常。学生离校须履行请销假手续，返校后及时办理注册。",
  ],
  学术活动: [
    "论坛设主题报告、特邀报告与圆桌对话三个环节。来自校内外的学者围绕关键科学问题分享最新研究进展，并就方法创新、数据共享与交叉合作展开热烈讨论；论坛同期举办了青年学者海报展示。",
    "研讨会采用线上线下相结合的方式进行，吸引了多所高校与科研机构的代表参加。与会专家分别介绍各自团队的研究方向与阶段性成果，并就下一步联合申报项目、共享实验平台等事项达成初步共识。",
    "本次活动面向校内外青年学者征集论文，选题涵盖基础研究与应用研究两个方向。组委会将组织专家进行双向匿名评审，优秀论文推荐至相关学术期刊，并邀请作者在论坛上作口头报告。",
  ],
  招生就业: [
    "本次双选会共有百余家用人单位参加，提供岗位两千余个，覆盖信息技术、先进制造、材料化工与金融咨询等行业。现场设置政策咨询、简历诊断与面试辅导专区，为毕业生提供一站式服务。",
    "招生章程对招生计划、录取规则、专业要求与收费标准等内容作了明确说明。学校将继续实施大类招生与专业分流相结合的培养模式，并完善转专业、辅修与微专业等制度，为学生提供更多选择空间。",
    "该专业将以此为契机，进一步优化课程体系、强化实践教学环节，并加强与行业企业的协同育人。学校将配套投入专项建设经费，支持师资队伍建设、实验条件改善与教学资源开发。",
  ],
  科研动态: [
    "研究团队围绕关键科学问题开展系统实验与理论分析，提出了新的方法与技术路径。相关结果在多个数据集上取得优于已有方法的性能，并完成小规模验证，为后续中试放大与工程应用奠定基础。",
    "项目启动会明确了研究目标、技术路线、里程碑节点与经费使用计划。项目组将按照任务书要求开展联合攻关，并建立定期进展汇报与风险预警机制，确保各项研究任务按期高质量完成。",
    "本次获奖成果涵盖基础研究、技术发明与产学研合作等类别，集中体现了学校在相关领域的积累与突破。学校将进一步完善科研评价与激励机制，支持科研人员长期稳定地开展原创性研究。",
  ],
  校园文化: [
    "本届艺术节为期两周，设舞台演出、主题展览、文化沙龙与工作坊四大板块，涵盖合唱、民乐、话剧、书画摄影展与非遗手作体验等活动，并邀请校外艺术家驻校开展创作交流。",
    "参赛同学在指导教师带领下完成选题调研、方案设计与多轮迭代，并在现场答辩中清晰呈现作品的设计思路与应用价值。评委从创新性、完成度与表达能力等维度进行综合评定。",
    "活动设置互动体验与成果展示环节，吸引众多师生驻足参与。组织方表示，将持续打造校园文化品牌活动，为学生提供更多展示自我、交流学习的平台。",
  ],
};

/** 正文结尾长段（所有文章共用；同时充当字体 / 字号缩放所需的长文本样本） */
const CONTENT_CLOSING =
  "明德大学坚持以人才培养为根本任务，围绕区域经济社会发展需要持续优化学科布局，构建了多学科协调发展的办学格局。" +
  "学校建有多个省部级重点实验室与工程研究中心，与国内外高校和科研机构保持稳定的交流合作，为学生提供广阔的实践平台与成长空间。" +
  "校园四季分明，教学楼、图书馆、实验楼与运动场馆错落分布，师生的学习、研究与生活在这里有序展开。";

/** 单页正文段落（key = `site:channel`；`{school}` 由站点名替换） */
const PAGE_PARAGRAPHS: Record<string, readonly string[]> = {
  "main:about": [
    "明德大学是一所以工为主、理工结合、多学科协调发展的教学研究型大学，办学历史可追溯至二十世纪二十年代。学校现设有多个学院与教学单位，覆盖工学、理学、管理学、经济学、文学与艺术等学科门类。",
    "学校坚持人才培养的中心地位，构建了本科教育、研究生教育与继续教育相衔接的培养体系，持续推进课程改革、实践教学与创新创业教育，努力为学生提供富有挑战性的成长环境。",
    "学校面向区域经济社会发展需求开展科学研究与社会服务，建有多个省部级重点实验室、工程研究中心与人文社科研究基地，并与行业企业、科研院所保持长期稳定的合作。",
    "学校重视开放办学，与多个国家和地区的高校及科研机构建立了交流关系，开展学生交换、教师互访与联合研究。校园文化氛围活跃，学生在学术、科技、文艺与体育等领域都有丰富的参与机会。",
  ],
  "main:history": [
    "明德大学的办学源头可追溯至 1923 年，最初以工科教育起步，后逐步增设理、管、文等学科，形成多科性办学格局。",
    "二十世纪中叶以来，学校经历多次院系调整与办学层次提升，先后开展本科教育与研究生教育，逐步建立起较为完整的学科体系与人才培养体系。",
    "进入新世纪，学校持续加强内涵建设，推进学科交叉、产教融合与国际化办学，办学条件与人才培养质量稳步提升。",
    "面向未来，学校将继续以人才培养为根本任务，坚持特色发展与高质量发展并重，努力建设特色鲜明的高水平大学。",
  ],
  "main:leaders": [
    "本页介绍学校现任领导班子与工作分工（演示数据，人物与职务均为虚构）。",
    "校长：主持学校行政全面工作，分管发展规划、人事与审计工作。",
    "副校长（教学）：分管本科教育、研究生教育与教学质量监控；副校长（科研）：分管科学研究、学科建设与实验室管理；副校长（国际合作）：分管国际交流、留学生教育与校友工作。",
    "学校重大事项经领导班子会议集体讨论决定，并按信息公开要求向师生与社会公布。",
  ],
  "main:organization": [
    "学校组织机构由教学科研单位、行政管理部门与直属单位三部分组成。",
    "教学科研单位包括各学院与研究院（中心），承担人才培养、科学研究与社会服务等职能。",
    "行政管理部门包括教务、科研、人事、财务、学生工作与后勤保障等机构，为教学科研提供支撑与保障。",
    "直属单位包括图书馆、信息中心、工程训练中心与档案馆等，面向全校师生提供公共服务。",
  ],
  "main:contact": [
    "地址：演示地址（非真实校址）。本页联系方式均为占位信息，不指向任何真实机构或个人。",
    "招生咨询、就业服务、图书文献与网络服务等联系方式，请以站内各栏目公布的信息为准。",
    "工作日服务时间：上午 8:30—11:30，下午 13:30—17:00（演示信息）。",
    "如需反馈站内问题，请通过后台留言功能提交，我们会在一个工作日内处理。",
  ],
  "dept:about": [
    "{school}是明德大学下设的二级学院，围绕学科前沿与行业需求开展人才培养与科学研究。",
    "{school}现设有多个本科专业与研究方向，拥有结构合理的师资队伍与较为完善的实验实践条件。",
    "{school}与行业企业、科研机构保持合作，通过联合实验室、实习基地与产学研项目为学生提供实践机会。",
    "学院将持续优化课程体系与培养模式，提升人才培养质量与科研服务水平。",
  ],
};

/** 用词池填充标题模板（词池里没有的键按序数处理） */
function fillTitle(tpl: string, i: number, words: Record<string, readonly string[]>): string {
  let out = tpl;
  let k = 0;
  for (const [key, pool] of Object.entries(words)) {
    const token = `{${key}}`;
    while (out.includes(token)) {
      k += 1;
      // ⚠ i 的系数必须是 1（与任意池长互素），否则长度能整除该系数的词池只能取到少数几个值
      out = out.replace(token, pick(pool, i + k * 13));
    }
  }
  let n = 0;
  while (out.includes("{n}")) {
    n += 1;
    out = out.replace("{n}", String(2 + ((i * 3 + n * 5) % 22)));
  }
  return out;
}

/** 每分类的标题候选池（枚举「模板 × 词池」组合并去重，进程内缓存） */
const titlePoolCache = new Map<string, readonly string[]>();
function titlePool(category: string): readonly string[] {
  const cached = titlePoolCache.get(category);
  if (cached) {
    return cached;
  }
  const templates = TITLE_TEMPLATES[category] ?? ["明德大学要闻"];
  const words = TITLE_WORDS[category] ?? {};
  const seen = new Set<string>();
  const list: string[] = [];
  for (const tpl of templates) {
    for (let k = 0; k < 200; k += 1) {
      const s = fillTitle(tpl, k, words);
      if (!seen.has(s)) {
        seen.add(s);
        list.push(s);
      }
    }
  }
  titlePoolCache.set(category, list);
  return list;
}

/** 取标题：**先穷尽该分类的候选池**（池容量按文章数放大），池空后才退化重复。
 *  ⚠ 必须用「同分类内第几条」（seq）而不是全局下标——全局下标会让模板与词池
 *  的步长相关，实际只探索到很少的组合（实测曾导致 25 条标题撞名）。 */
function buildTitle(category: string, seq: number, used: Set<string>): string {
  const pool = titlePool(category);
  for (let a = 0; a < pool.length; a += 1) {
    const candidate = pool[(seq * 7 + a) % pool.length];
    if (candidate && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = pool[seq % Math.max(1, pool.length)] ?? "明德大学要闻";
  used.add(fallback);
  return fallback;
}

/** 按分类取池中一条（分类缺失时回落到「学校要闻」） */
function pickFrom(map: Record<string, readonly string[]>, key: string, index: number): string {
  const pool = map[key] ?? map["学校要闻"] ?? [];
  return pool.length ? pick(pool, index) : "";
}

/** 每站点的文章数与状态数（合计：published 80 / pf 6 / pfinal 4 / draft 4 / rej 3 / wd 3 = 100） */
const ARTICLE_PLAN = [
  {
    site: "main",
    published: 50,
    pendingFirst: 3,
    pendingFinal: 2,
    draft: 2,
    rejected: 2,
    withdrawn: 1,
  },
  {
    site: "cs",
    published: 11,
    pendingFirst: 1,
    pendingFinal: 1,
    draft: 1,
    rejected: 0,
    withdrawn: 0,
  },
  {
    site: "ee",
    published: 10,
    pendingFirst: 1,
    pendingFinal: 1,
    draft: 0,
    rejected: 1,
    withdrawn: 0,
  },
  {
    site: "ba",
    published: 9,
    pendingFirst: 1,
    pendingFinal: 0,
    draft: 1,
    rejected: 0,
    withdrawn: 2,
  },
] as const;

const MEDIA_FOLDERS = ["carousel", "news", "dept", "leader", "other"] as const;
const MEDIA_ALBUMS = ["校园风光", "教学科研", "学生活动", "校园建筑"] as const;

// ---------------------------------------------------------------------------
// 类型：内存中的 id 映射
// ---------------------------------------------------------------------------

type IdMap = Map<string, string>;

// ---------------------------------------------------------------------------
// seedXxx
// ---------------------------------------------------------------------------

async function seedSites(): Promise<{ siteIds: IdMap; siteNames: IdMap }> {
  const siteIds: IdMap = new Map();
  const siteNames: IdMap = new Map();

  for (const [i, site] of SITES.entries()) {
    const row = await prisma.site.upsert({
      where: { slug: site.slug },
      create: {
        slug: site.slug,
        name: site.name,
        nameEn: site.nameEn ?? null,
        template: site.template,
        description: site.description,
        descriptionEn: site.descriptionEn ?? null,
        status: true,
        createdAt: shift(-120),
        updatedAt: shift(-120),
      },
      update: {
        name: site.name,
        nameEn: site.nameEn ?? null,
        template: site.template,
        description: site.description,
        descriptionEn: site.descriptionEn ?? null,
        status: true,
        updatedAt: shift(-120 + i),
      },
    });
    siteIds.set(site.slug, row.id);
    siteNames.set(site.slug, row.name);
  }

  count("Site", SITES.length);
  return { siteIds, siteNames };
}

async function seedChannels(siteIds: IdMap): Promise<{ channelIds: IdMap; enabled: number }> {
  let enabled = 0;

  async function upsertChannel(
    siteSlug: string,
    def: ChannelSeed,
    sort: number,
    parentId?: string,
  ): Promise<void> {
    assertSlugAllowedForSeed(def.slug, siteSlug);
    const siteId = siteIds.get(siteSlug);
    if (!siteId) throw new Error(`[seed] 站点不存在：${siteSlug}`);

    const row = await prisma.channel.upsert({
      where: { siteId_slug: { siteId, slug: def.slug } },
      create: {
        siteId,
        parentId: parentId ?? null,
        name: def.name,
        nameEn: def.nameEn ?? null,
        slug: def.slug,
        type: def.type,
        template: def.template ?? null,
        description: def.description ?? null,
        sort,
        status: true,
        createdAt: shift(-119),
        updatedAt: shift(-119),
      },
      update: {
        parentId: parentId ?? null,
        name: def.name,
        nameEn: def.nameEn ?? null,
        type: def.type,
        template: def.template ?? null,
        description: def.description ?? null,
        sort,
        status: true,
        updatedAt: shift(-119),
      },
    });
    enabled += 1;
    channelIds.set(`${siteSlug}:${def.slug}`, row.id);
  }

  const channelIds: IdMap = new Map();

  // 主站：8 顶级 + about 下 4 子栏目
  for (const [i, def] of MAIN_CHANNELS.filter((c) => !c.parentSlug).entries()) {
    await upsertChannel("main", def, i + 1);
  }
  const aboutId = channelIds.get("main:about");
  for (const [i, def] of MAIN_CHANNELS.filter((c) => c.parentSlug).entries()) {
    await upsertChannel("main", def, i + 1, aboutId);
  }

  // 子站：各 6 个顶级栏目
  for (const site of SITES.filter((s) => s.slug !== "main")) {
    for (const [i, def] of SUB_CHANNELS.entries()) {
      await upsertChannel(site.slug, def, i + 1);
    }
  }

  count("Channel", enabled);
  return { channelIds, enabled };
}

async function seedNavigations(siteIds: IdMap, channelIds: IdMap): Promise<void> {
  type NavSeed = {
    name: string;
    /** 英文名（M5-1 / docs/00 §8 #58） */
    nameEn?: string;
    channel?: string;
    url?: string;
    icon: string;
    target?: string;
  };
  const mainNav: readonly NavSeed[] = [
    { name: "学校概况", nameEn: "About", channel: "about", icon: "School" },
    { name: "新闻中心", nameEn: "News", channel: "news", icon: "Newspaper" },
    { name: "通知公告", nameEn: "Notices", channel: "notice", icon: "Bell" },
    {
      name: "院系设置",
      nameEn: "Schools & Departments",
      channel: "departments",
      icon: "Building2",
    },
    { name: "师资队伍", nameEn: "Faculty", channel: "faculty", icon: "Users" },
    {
      name: "招生就业",
      nameEn: "Admissions & Careers",
      channel: "admissions",
      icon: "GraduationCap",
    },
    { name: "科学研究", nameEn: "Research", channel: "research", icon: "FlaskConical" },
    { name: "信息公开", nameEn: "Disclosure", channel: "disclosure", icon: "FileText" },
  ];
  const subNav: readonly NavSeed[] = [
    { name: "学院概况", nameEn: "About the School", channel: "about", icon: "School" },
    { name: "新闻动态", nameEn: "News", channel: "news", icon: "Newspaper" },
    { name: "师资队伍", nameEn: "Faculty", channel: "faculty", icon: "Users" },
    { name: "专业介绍", nameEn: "Programs", channel: "programs", icon: "BookOpen" },
    { name: "科研成果", nameEn: "Research", channel: "research", icon: "FlaskConical" },
  ];
  // 友情链接位：**不指向任何真实机构**（合规：本项目为虚构演示，不冒充真实单位）
  const extraLink: NavSeed = {
    name: "友情链接",
    nameEn: "Links",
    url: "#",
    icon: "ExternalLink",
    target: "_self",
  };

  let n = 0;
  async function upsertNav(siteSlug: string, def: NavSeed, sort: number): Promise<void> {
    n += 1;
    const id = `seed-nav-${n}`;
    const siteId = siteIds.get(siteSlug);
    if (!siteId) throw new Error(`[seed] 站点不存在：${siteSlug}`);
    const channelId = def.channel ? (channelIds.get(`${siteSlug}:${def.channel}`) ?? null) : null;
    if (!channelId && !def.url) {
      throw new Error(
        `[seed] Navigation「${def.name}」的 channelId 与 url 同时为空（docs/14 §5.3 要求至少一个非空）`,
      );
    }
    await prisma.navigation.upsert({
      where: { id },
      create: {
        id,
        siteId,
        name: def.name,
        nameEn: def.nameEn ?? null,
        channelId,
        url: def.url ?? null,
        target: def.target ?? "_self",
        icon: def.icon,
        sort,
        status: true,
        createdAt: shift(-119),
        updatedAt: shift(-119),
      },
      update: {
        siteId,
        name: def.name,
        nameEn: def.nameEn ?? null,
        channelId,
        url: def.url ?? null,
        target: def.target ?? "_self",
        icon: def.icon,
        sort,
        status: true,
        updatedAt: shift(-119),
      },
    });
  }

  // 主站 8 项 + 1 项友情链接（footer 用）
  for (const [i, def] of mainNav.entries()) await upsertNav("main", def, i + 1);
  await upsertNav("main", extraLink, 99);

  // 子站各 5 项
  for (const site of SITES.filter((s) => s.slug !== "main")) {
    for (const [i, def] of subNav.entries()) await upsertNav(site.slug, def, i + 1);
  }

  count("Navigation", n);
}

async function seedPages(siteIds: IdMap, channelIds: IdMap): Promise<void> {
  type PageSeed = { site: string; channel: string; title: string; slug: string; summary: string };
  const pages: readonly PageSeed[] = [
    {
      site: "main",
      channel: "about",
      title: "学校简介",
      slug: "about",
      summary: "学校办学定位、历史与现状",
    },
    {
      site: "main",
      channel: "history",
      title: "历史沿革",
      slug: "history",
      summary: "学校发展沿革",
    },
    {
      site: "main",
      channel: "leaders",
      title: "现任领导",
      slug: "leaders",
      summary: "学校现任领导班子",
    },
    {
      site: "main",
      channel: "organization",
      title: "组织机构",
      slug: "organization",
      summary: "教学科研机构与行政服务部门",
    },
    {
      site: "main",
      channel: "contact",
      title: "联系我们",
      slug: "contact",
      summary: "地址、电话与来访路线",
    },
    { site: "cs", channel: "about", title: "学院概况", slug: "about", summary: "计算机学院简介" },
    { site: "ee", channel: "about", title: "学院概况", slug: "about", summary: "电子信息学院简介" },
    { site: "ba", channel: "about", title: "学院概况", slug: "about", summary: "商学院简介" },
  ];

  for (const [i, p] of pages.entries()) {
    const siteId = siteIds.get(p.site);
    const channelId = channelIds.get(`${p.site}:${p.channel}`);
    if (!siteId || !channelId) throw new Error(`[seed] Page 依赖缺失：${p.site}/${p.channel}`);
    // 单页正文：按 site:channel 取段落（子站 about 用 {school} 占位），内容为虚构演示
    const siteName = SITES.find((s) => s.slug === p.site)?.name ?? "明德大学";
    const paras = PAGE_PARAGRAPHS[`${p.site}:${p.channel}`] ?? PAGE_PARAGRAPHS["dept:about"] ?? [];
    const content =
      `<h2>${p.title}</h2>` +
      paras.map((t) => `<p>${t.replace("{school}", siteName)}</p>`).join("");
    await prisma.page.upsert({
      where: { siteId_channelId: { siteId, channelId } },
      create: {
        siteId,
        channelId,
        title: p.title,
        slug: p.slug,
        content,
        status: "published",
        sort: i + 1,
        publishedAt: shift(-100 + i),
        createdAt: shift(-100 + i),
        updatedAt: shift(-100 + i),
      },
      update: {
        title: p.title,
        slug: p.slug,
        content,
        status: "published",
        sort: i + 1,
        publishedAt: shift(-100 + i),
        updatedAt: shift(-100 + i),
      },
    });
  }

  count("Page", pages.length);
}

async function seedRoles(): Promise<IdMap> {
  const roleIds: IdMap = new Map();
  // Role.code 唯一 → 只有一个 site_admin / editor / auditor 行；每用户的实际数据范围
  // 由 UserRole.siteId 表达（docs/13 §6.1 的 UserRole.siteId 列）。此处挂 main。
  const mainSite = await prisma.site.findUnique({ where: { slug: "main" } });
  const mainId = mainSite?.id ?? null;

  for (const [i, role] of ROLES.entries()) {
    const row = await prisma.role.upsert({
      where: { code: role.code },
      create: {
        code: role.code,
        name: role.name,
        siteId: role.code === "super_admin" ? null : mainId,
        scope: role.scope,
        isSystem: true,
        description: role.description,
        sort: i + 1,
        status: true,
        createdAt: shift(-119),
        updatedAt: shift(-119),
      },
      update: {
        name: role.name,
        siteId: role.code === "super_admin" ? null : mainId,
        scope: role.scope,
        isSystem: true,
        description: role.description,
        sort: i + 1,
        status: true,
        updatedAt: shift(-119),
      },
    });
    roleIds.set(role.code, row.id);
  }

  count("Role", ROLES.length);
  return roleIds;
}

async function seedPermissions(): Promise<IdMap> {
  const permissionIds: IdMap = new Map();

  for (const [i, p] of PERMISSIONS.entries()) {
    const row = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, type: p.type, group: p.group, sort: i + 1 },
      update: { name: p.name, type: p.type, group: p.group, sort: i + 1 },
    });
    permissionIds.set(p.code, row.id);
  }

  count("Permission", PERMISSIONS.length);
  return permissionIds;
}

async function seedRolePermissions(roleIds: IdMap, permissionIds: IdMap): Promise<void> {
  let n = 0;

  for (const [code, matrix] of Object.entries(ROLE_MATRIX)) {
    const roleId = roleIds.get(code);
    if (!roleId) throw new Error(`[seed] 角色不存在：${code}`);
    const wanted = [...matrix.menus, ...matrix.actions, ...matrix.data];

    for (const permissionCode of wanted) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) throw new Error(`[seed] 权限码不存在：${permissionCode}`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        create: { roleId, permissionId, createdAt: shift(-119) },
        update: {},
      });
      n += 1;
    }
  }

  count("RolePermission", n);
}

async function seedUsers(siteIds: IdMap): Promise<IdMap> {
  const userIds: IdMap = new Map();
  const password = bcrypt.hashSync(DEMO_PASSWORD, 10);

  for (const [i, u] of USERS.entries()) {
    const siteId = u.site ? (siteIds.get(u.site) ?? null) : null;
    const row = await prisma.user.upsert({
      where: { username: u.username },
      create: {
        username: u.username,
        password,
        name: u.name,
        email: `${u.username}@campus-portal.local`,
        role: u.role,
        siteId,
        status: true,
        createdAt: shift(-118 + i),
        updatedAt: shift(-118 + i),
      },
      // ⚠ password 只在 create 时写：bcrypt 的 salt 随机，若每次 update 都重算哈希，
      //   第二次 seed 会改动已有行（破坏幂等）。update 里刻意不含 password。
      update: {
        name: u.name,
        email: `${u.username}@campus-portal.local`,
        role: u.role,
        siteId,
        status: true,
        updatedAt: shift(-118 + i),
      },
    });
    userIds.set(u.username, row.id);
  }

  count("User", USERS.length);
  return userIds;
}

async function seedUserRoles(userIds: IdMap, roleIds: IdMap, siteIds: IdMap): Promise<void> {
  for (const u of USERS) {
    const userId = userIds.get(u.username);
    const roleId = roleIds.get(u.role);
    if (!userId || !roleId) throw new Error(`[seed] UserRole 依赖缺失：${u.username}`);
    const siteId = u.site ? (siteIds.get(u.site) ?? null) : null;

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, siteId, createdAt: shift(-118) },
      update: { siteId },
    });
  }

  count("UserRole", USERS.length);
}

/** 生成 100 篇文章的确定性计划（站点 + 状态 + 分类 + 频道） */
type ArticlePlanRow = {
  site: string;
  channel: string;
  category: string;
  status: string;
  index: number;
};

function buildArticlePlan(): ArticlePlanRow[] {
  const rows: ArticlePlanRow[] = [];

  // 全局分类队列：按 docs/10 §4 的 30/20/15/15/10/10 展开
  const categoryQueue: string[] = [];
  for (const c of ARTICLE_CATEGORIES) {
    for (let i = 0; i < c.count; i += 1) categoryQueue.push(c.name);
  }

  const subListChannels = ["news", "faculty", "programs", "research"];
  let cursor = 0;

  for (const plan of ARTICLE_PLAN) {
    const states: string[] = [
      ...Array<string>(plan.published).fill("published"),
      ...Array<string>(plan.pendingFirst).fill("pending_first"),
      ...Array<string>(plan.pendingFinal).fill("pending_final"),
      ...Array<string>(plan.draft).fill("draft"),
      ...Array<string>(plan.rejected).fill("rejected"),
      ...Array<string>(plan.withdrawn).fill("withdrawn"),
    ];

    for (const [i, status] of states.entries()) {
      const category = categoryQueue[cursor] ?? "学校要闻";
      const mainChannel =
        ARTICLE_CATEGORIES.find((c) => c.name === category)?.mainChannel ?? "news";
      const channel = plan.site === "main" ? mainChannel : pick(subListChannels, i);
      rows.push({ site: plan.site, channel, category, status, index: i });
      cursor += 1;
    }
  }

  return rows;
}

async function seedArticles(
  siteIds: IdMap,
  channelIds: IdMap,
  userIds: IdMap,
): Promise<{ articleIds: string[]; publishedIds: string[]; byId: Map<string, ArticlePlanRow> }> {
  const plan = buildArticlePlan();
  const articleIds: string[] = [];
  const publishedIds: string[] = [];
  const byId = new Map<string, ArticlePlanRow>();

  /** 每站点的稿件归属人（editor 优先，符合约束 C4「editor 只能操作本人稿件」） */
  const creatorsBySite: Record<string, readonly string[]> = {
    main: ["editor", "site_admin"],
    cs: ["editor2", "site_cs"],
    ee: ["editor3", "site_ee"],
    ba: ["editor4", "site_ba"],
  };

  const authorsByCategory: Record<string, string> = {
    学校要闻: "宣传部",
    通知公告: "校长办公室",
    学术活动: "科研管理处",
    招生就业: "招生就业处",
    科研动态: "科研管理处",
    校园文化: "组织部",
  };

  /** 同分类内标题去重（模板池 × 词池组合后仍可能撞名，撞了就换一组） */
  const usedTitles = new Set<string>();
  /** 每分类已生成条数（0 起算）——作为标题组合的序号，保证组合探索面均匀 */
  const categorySeq = new Map<string, number>();

  for (const [i, row] of plan.entries()) {
    const siteId = siteIds.get(row.site);
    const channelId = channelIds.get(`${row.site}:${row.channel}`);
    if (!siteId || !channelId)
      throw new Error(`[seed] Article 依赖缺失：${row.site}/${row.channel}`);

    const creator = pick(creatorsBySite[row.site] ?? ["editor"], i);
    const createdById = userIds.get(creator) ?? null;
    const slug = `article-${row.site}-${String(i + 1).padStart(3, "0")}`;
    // 标题 / 摘要 / 正文三件套（模板池 + 词池）；source 只区分主站与子站
    const seq = categorySeq.get(row.category) ?? 0;
    categorySeq.set(row.category, seq + 1);
    const title = buildTitle(row.category, seq, usedTitles);
    const summary = `${title}，${pickFrom(SUMMARY_TAILS, row.category, i * 3)}`;
    const source = row.site === "main" ? "明德大学新闻网" : "学院办公室";
    const viewCount = (hash32(slug) % 900) + 100;
    const published = row.status === "published";
    const createdAt = shift(-90 + (i % 60), i % 12, i % 60);
    const publishTime = published ? shift(-90 + (i % 60) + 1, i % 12) : null;
    const content =
      `<h2>${title}</h2>` +
      `<p>${summary}</p>` +
      `<p>${pickFrom(CONTENT_BODIES, row.category, i * 5 + 1)}</p>` +
      `<p>${CONTENT_CLOSING}</p>`;
    const tags = json([row.category, row.site === "main" ? "校级" : "院级"]);

    const created = await prisma.article.upsert({
      where: { siteId_slug: { siteId, slug } },
      create: {
        siteId,
        channelId,
        title,
        slug,
        summary,
        content,
        cover: `/uploads/seed/news/cover-${(i % 50) + 1}.jpg`,
        author: authorsByCategory[row.category] ?? "新闻中心",
        createdById,
        source,
        tags,
        status: row.status,
        top: published && i % 10 === 0,
        recommend: published && i % 5 === 0,
        viewCount,
        publishTime,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
      update: {
        channelId,
        title,
        summary,
        content,
        cover: `/uploads/seed/news/cover-${(i % 50) + 1}.jpg`,
        author: authorsByCategory[row.category] ?? "新闻中心",
        createdById,
        source,
        tags,
        status: row.status,
        top: published && i % 10 === 0,
        recommend: published && i % 5 === 0,
        viewCount,
        publishTime,
        updatedAt: createdAt,
      },
    });

    articleIds.push(created.id);
    byId.set(created.id, row);
    if (published) publishedIds.push(created.id);
  }

  count("Article", plan.length);
  return { articleIds, publishedIds, byId };
}

async function seedArticleVersions(
  publishedIds: readonly string[],
  articleIds: readonly string[],
  userIds: IdMap,
): Promise<void> {
  // 120 = 80 篇 published 各 1 版 + 前 40 篇各加第 2 版
  const targets = publishedIds.length > 0 ? publishedIds : articleIds;
  const withSecond = targets.slice(0, 40);
  let n = 0;

  async function upsertVersion(
    articleId: string,
    version: number,
    editor: string,
    title: string,
    content: string,
    createdAt: Date,
    userId: string | null,
  ): Promise<void> {
    await prisma.articleVersion.upsert({
      where: { articleId_version: { articleId, version } },
      create: { articleId, version, title, content, editor, userId, createdAt },
      update: { title, content, editor, userId },
    });
    n += 1;
  }

  for (const [i, articleId] of targets.entries()) {
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new Error(`[seed] ArticleVersion 依赖缺失：${articleId}`);
    const editor = userIds.get(i % 2 === 0 ? "editor" : "site_admin") ?? null;
    await upsertVersion(
      articleId,
      1,
      editor
        ? (USERS.find((u) => u.username === (i % 2 === 0 ? "editor" : "site_admin"))?.name ??
            "编辑")
        : "编辑",
      article.title,
      article.content,
      shift(-91 + (i % 60)),
      editor,
    );

    if (withSecond.includes(articleId)) {
      await upsertVersion(
        articleId,
        2,
        "主站管理员",
        `${article.title}（修订版）`,
        `${article.content}<p>本次修订补充了配图说明与附件（版本 2）。</p>`,
        shift(-90 + (i % 60)),
        userIds.get("site_admin") ?? null,
      );
    }
  }

  count("ArticleVersion", n);
}

async function seedAuditRecords(
  articleIds: readonly string[],
  publishedIds: readonly string[],
  userIds: IdMap,
  byId: Map<string, ArticlePlanRow>,
): Promise<void> {
  let n = 0;

  function actorFor(username: string): { id: string | null; name: string; role: string } {
    const def = USERS.find((u) => u.username === username);
    return {
      id: userIds.get(username) ?? null,
      name: def?.name ?? username,
      role: def?.role ?? "editor",
    };
  }

  async function addAudit(
    articleId: string,
    edge: (typeof STATE_EDGES)[keyof typeof STATE_EDGES],
    operator: string,
    at: Date,
    comment: string,
  ): Promise<void> {
    n += 1;
    const id = `seed-audit-${n}`;
    const who = actorFor(operator);
    await prisma.auditRecord.upsert({
      where: { id },
      create: {
        id,
        articleId,
        step: edge.step,
        fromStatus: edge.from,
        toStatus: edge.to,
        operatorName: who.name,
        userId: who.id,
        role: who.role,
        comment,
        createdAt: at,
      },
      update: {
        articleId,
        step: edge.step,
        fromStatus: edge.from,
        toStatus: edge.to,
        operatorName: who.name,
        userId: who.id,
        role: who.role,
        comment,
        createdAt: at,
      },
    });
  }

  // 1) 非 published 文章的流转轨迹（32 条）
  for (const [i, articleId] of articleIds.entries()) {
    const row = byId.get(articleId);
    if (!row) continue;
    const base = shift(-88 + (i % 60), i % 12);

    if (row.status === "pending_first") {
      await addAudit(articleId, STATE_EDGES.submit, "editor", base, "提交初审");
    } else if (row.status === "pending_final") {
      await addAudit(articleId, STATE_EDGES.submit, "editor", base, "提交初审");
      await addAudit(
        articleId,
        STATE_EDGES.review,
        "auditor",
        shift(-88 + (i % 60), (i % 12) + 1),
        "初审通过，转终审",
      );
    } else if (row.status === "rejected") {
      await addAudit(articleId, STATE_EDGES.submit, "editor", base, "提交初审");
      await addAudit(
        articleId,
        STATE_EDGES.rejectFirst,
        "auditor",
        shift(-88 + (i % 60), (i % 12) + 1),
        "选题与事实需补充，退回修改",
      );
    } else if (row.status === "withdrawn") {
      await addAudit(articleId, STATE_EDGES.submit, "editor", base, "提交初审");
      await addAudit(
        articleId,
        STATE_EDGES.review,
        "auditor",
        shift(-88 + (i % 60), (i % 12) + 1),
        "初审通过，转终审",
      );
      await addAudit(
        articleId,
        STATE_EDGES.publish,
        "site_admin",
        shift(-88 + (i % 60), (i % 12) + 2),
        "终审通过并发布",
      );
      await addAudit(
        articleId,
        STATE_EDGES.withdraw,
        "site_admin",
        shift(-88 + (i % 60), (i % 12) + 3),
        "按上级要求撤稿",
      );
    }
    // draft：尚未提交，无流转记录（符合状态机）
  }

  // 2) 前 40 篇 published 各 3 步完整轨迹（120 条）→ 合计 152 ≈ docs 的「约 150」
  for (const [i, articleId] of publishedIds.slice(0, 40).entries()) {
    const base = shift(-92 + (i % 60), i % 12);
    await addAudit(articleId, STATE_EDGES.submit, "editor", base, "提交初审");
    await addAudit(
      articleId,
      STATE_EDGES.review,
      "auditor",
      new Date(base.getTime() + 3600_000),
      "初审通过，转终审",
    );
    await addAudit(
      articleId,
      STATE_EDGES.publish,
      "site_admin",
      new Date(base.getTime() + 7200_000),
      "终审通过并发布",
    );
  }

  count("AuditRecord", n);
}

/**
 * 媒体库素材名池（首页轮播会把 carousel 的 name 直接叠字显示为 Hero 标题）
 * ---------------------------------------------------------------------------
 * · carousel = **Hero 标题池**：Hero 只取 `createdAt` 最新的 5 张（= 序号最大的 5 条），
 *   故按**倒序**取池内标题 ⇒ 首张（最新）显示 pool[0]，且 5 张各不相同。
 * · 其它 folder 前台不渲染（仅后台媒体库列表），单元素池即固定名。
 */
const MEDIA_NAME_POOL: Record<(typeof MEDIA_FOLDERS)[number], readonly string[]> = {
  carousel: ["走进明德", "书香明德", "学术明德", "全景明德", "青春明德"],
  dept: ["院系风采"],
  leader: ["师资风采"],
  news: ["明德映像"],
  other: ["校园生活"],
};

async function seedMedia(siteIds: IdMap, userIds: IdMap): Promise<void> {
  // Media.path 无唯一索引（规格的 upsert 键用不了）→ 固定 id（见文件头裁决 B）
  const total = 50;
  const uploaderId = userIds.get("site_admin") ?? null;

  for (let i = 1; i <= total; i += 1) {
    const id = `seed-media-${i}`;
    const folder = pick(MEDIA_FOLDERS, i - 1);
    // carousel 是首页 Hero 的图源：**强制 image**。
    // 否则 i=46 会同时命中 carousel 与 `i % 23 === 0`（file）⇒ 产出 /uploads/seed/carousel/file-046.pdf，
    // 而 Hero 取 createdAt 最新的 5 条 ⇒ 第 1 张恒为破图（走渐变兜底）。
    const type =
      folder === "carousel" ? "image" : i % 17 === 0 ? "video" : i % 23 === 0 ? "file" : "image";
    const path = `/uploads/seed/${folder}/${type}-${String(i).padStart(3, "0")}.${type === "video" ? "mp4" : type === "file" ? "pdf" : "jpg"}`;
    // 同 folder 内的序号（1~10）；carousel 倒序取标题池，使 Hero（最新 5 条）各不相同
    const perFolder = Math.floor(total / MEDIA_FOLDERS.length);
    const ordinal = Math.floor((i - 1) / MEDIA_FOLDERS.length) + 1;
    const pool = MEDIA_NAME_POOL[folder];
    const poolIndex = (folder === "carousel" ? perFolder - ordinal : ordinal - 1) % pool.length;
    const base = pool[poolIndex] ?? pool[0] ?? "校园素材";
    // 多元素池（carousel）= Hero 标题，直接使用；单元素池加 01~10 序号，便于后台媒体库区分
    const name = pool.length > 1 ? base : `${base} ${String(ordinal).padStart(2, "0")}`;
    const siteSlug = i % 5 === 0 ? null : pick(["main", "main", "cs", "ee", "ba"], i);
    const siteId = siteSlug ? (siteIds.get(siteSlug) ?? null) : null;

    await prisma.media.upsert({
      where: { id },
      create: {
        id,
        siteId,
        type,
        name,
        path,
        size: 80_000 + (hash32(path) % 900_000),
        mimeType:
          type === "video" ? "video/mp4" : type === "file" ? "application/pdf" : "image/jpeg",
        width: type === "image" ? 1200 : null,
        height: type === "image" ? 800 : null,
        folder,
        album: i % 4 === 0 ? pick(MEDIA_ALBUMS, i) : null,
        uploader: "主站管理员",
        uploaderId,
        createdAt: shift(-110 + (i % 60)),
        deletedAt: null,
      },
      update: {
        siteId,
        type,
        name,
        size: 80_000 + (hash32(path) % 900_000),
        mimeType:
          type === "video" ? "video/mp4" : type === "file" ? "application/pdf" : "image/jpeg",
        width: type === "image" ? 1200 : null,
        height: type === "image" ? 800 : null,
        folder,
        album: i % 4 === 0 ? pick(MEDIA_ALBUMS, i) : null,
        uploader: "主站管理员",
        uploaderId,
      },
    });
  }

  count("Media", total);
}

async function seedAttachments(publishedIds: readonly string[]): Promise<void> {
  // Attachment 无唯一约束（规格键用不了）→ 固定 id（裁决 B）
  const total = 20;
  const targets = publishedIds.slice(0, total);

  for (const [i, articleId] of targets.entries()) {
    const id = `seed-attach-${i + 1}`;
    const fileName = `${i + 1 === total ? "通知附件" : "新闻报道附件"}-${String(i + 1).padStart(2, "0")}.pdf`;
    const filePath = `/uploads/seed/files/attachment-${String(i + 1).padStart(2, "0")}.pdf`;

    await prisma.attachment.upsert({
      where: { id },
      create: {
        id,
        articleId,
        pageId: null,
        mediaId: null,
        fileName,
        filePath,
        size: 120_000 + (hash32(filePath) % 800_000),
        mimeType: "application/pdf",
        downloadCount: hash32(filePath) % 200,
        sort: i + 1,
        createdAt: shift(-89 + (i % 40)),
        deletedAt: null,
      },
      update: {
        articleId,
        fileName,
        size: 120_000 + (hash32(filePath) % 800_000),
        mimeType: "application/pdf",
        downloadCount: hash32(filePath) % 200,
        sort: i + 1,
      },
    });
  }

  count("Attachment", targets.length);
}

async function seedComments(siteIds: IdMap, publishedIds: readonly string[]): Promise<void> {
  const total = 30;
  const replyCount = 8;
  const statuses = ["approved", "approved", "approved", "pending", "rejected"] as const;
  const topLevelIds: string[] = [];
  let n = 0;

  // 先种 22 条顶级评论
  for (let i = 1; i <= total - replyCount; i += 1) {
    n += 1;
    const id = `seed-comment-${n}`;
    const articleId = pick(publishedIds, i * 3);
    const sites = SITES.map((s) => s.slug);
    const siteSlug = pick(sites, i);
    const siteId = siteIds.get(siteSlug);
    if (!siteId) throw new Error(`[seed] Comment 依赖缺失：${siteSlug}`);

    await prisma.comment.upsert({
      where: { id },
      create: {
        id,
        siteId,
        articleId,
        parentId: null,
        name: `访客${String(i).padStart(2, "0")}`,
        email: `guest${i}@example.com`,
        content: `第 ${i} 条演示评论：内容详实，期待后续报道。`,
        status: pick(statuses, i),
        ip: `10.0.${i % 250}.${(hash32(id) % 250) + 1}`,
        createdAt: shift(-80 + (i % 50), i % 20),
        deletedAt: null,
      },
      update: {
        siteId,
        articleId,
        parentId: null,
        name: `访客${String(i).padStart(2, "0")}`,
        email: `guest${i}@example.com`,
        content: `第 ${i} 条演示评论：内容详实，期待后续报道。`,
        status: pick(statuses, i),
        ip: `10.0.${i % 250}.${(hash32(id) % 250) + 1}`,
      },
    });
    topLevelIds.push(id);
  }

  // 再种 8 条回复：parentId 只挂顶级评论（docs/13 两级限制）
  for (let i = 1; i <= replyCount; i += 1) {
    n += 1;
    const id = `seed-comment-${n}`;
    const parentId = pick(topLevelIds, i * 2);
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error(`[seed] Comment 回复的父评论不存在：${parentId}`);

    await prisma.comment.upsert({
      where: { id },
      create: {
        id,
        siteId: parent.siteId,
        articleId: parent.articleId,
        parentId,
        name: `回复者${String(i).padStart(2, "0")}`,
        email: `reply${i}@example.com`,
        content: `第 ${i} 条演示回复：感谢关注，我们会持续更新。`,
        status: "approved",
        ip: `10.1.${i % 250}.${(hash32(id) % 250) + 1}`,
        createdAt: shift(-70 + (i % 40), i % 20),
        deletedAt: null,
      },
      update: {
        siteId: parent.siteId,
        articleId: parent.articleId,
        parentId,
        name: `回复者${String(i).padStart(2, "0")}`,
        email: `reply${i}@example.com`,
        content: `第 ${i} 条演示回复：感谢关注，我们会持续更新。`,
        status: "approved",
        ip: `10.1.${i % 250}.${(hash32(id) % 250) + 1}`,
      },
    });
  }

  count("Comment", n);
}

async function seedMessages(): Promise<void> {
  const total = 10;
  const types = ["leader", "suggestion", "complaint"] as const;
  const statuses = ["pending", "processing", "replied"] as const;

  for (let i = 1; i <= total; i += 1) {
    const id = `seed-message-${i}`;
    const status = pick(statuses, i);
    const replied = status === "replied";
    const createdAt = shift(-60 + (i % 40), i % 20);

    await prisma.message.upsert({
      where: { id },
      create: {
        id,
        type: pick(types, i),
        name: `来信人${String(i).padStart(2, "0")}`,
        contact: `1380000${String(1000 + i).slice(-4)}`,
        content: `第 ${i} 条演示留言：建议在首页增加校园地图入口，方便访客导航。`,
        status,
        reply: replied ? "感谢建议，已转相关部门评估，预计下个版本上线。" : null,
        repliedAt: replied ? new Date(createdAt.getTime() + 86_400_000) : null,
        createdAt,
      },
      update: {
        type: pick(types, i),
        name: `来信人${String(i).padStart(2, "0")}`,
        contact: `1380000${String(1000 + i).slice(-4)}`,
        content: `第 ${i} 条演示留言：建议在首页增加校园地图入口，方便访客导航。`,
        status,
        reply: replied ? "感谢建议，已转相关部门评估，预计下个版本上线。" : null,
        repliedAt: replied ? new Date(createdAt.getTime() + 86_400_000) : null,
      },
    });
  }

  count("Message", total);
}

async function seedForms(siteIds: IdMap): Promise<IdMap> {
  // Form.name 无唯一索引（规格键用不了）→ 固定 id（裁决 B）
  const forms = [
    {
      id: "seed-form-1",
      site: "main",
      name: "招生咨询",
      fields: [
        { name: "name", label: "姓名", type: "text", required: true },
        { name: "phone", label: "联系电话", type: "tel", required: true },
        { name: "province", label: "生源省份", type: "text", required: false },
        { name: "question", label: "咨询内容", type: "textarea", required: true },
      ],
    },
    {
      id: "seed-form-2",
      site: null,
      name: "意见反馈",
      fields: [
        { name: "name", label: "姓名", type: "text", required: false },
        { name: "email", label: "邮箱", type: "email", required: false },
        { name: "content", label: "反馈内容", type: "textarea", required: true },
      ],
    },
    {
      id: "seed-form-3",
      site: null,
      name: "活动报名",
      fields: [
        { name: "name", label: "姓名", type: "text", required: true },
        { name: "org", label: "单位", type: "text", required: true },
        { name: "count", label: "参加人数", type: "number", required: true },
        { name: "remark", label: "备注", type: "textarea", required: false },
      ],
    },
  ] as const;

  const formIds: IdMap = new Map();
  for (const [i, f] of forms.entries()) {
    const siteId = f.site ? (siteIds.get(f.site) ?? null) : null;
    const row = await prisma.form.upsert({
      where: { id: f.id },
      create: {
        id: f.id,
        siteId,
        name: f.name,
        fields: json(f.fields),
        status: true,
        createdAt: shift(-115 + i),
        updatedAt: shift(-115 + i),
      },
      update: {
        siteId,
        name: f.name,
        fields: json(f.fields),
        status: true,
        updatedAt: shift(-115 + i),
      },
    });
    formIds.set(f.name, row.id);
  }

  count("Form", forms.length);
  return formIds;
}

async function seedFormData(formIds: IdMap): Promise<void> {
  const statuses = ["new", "read", "archived"] as const;
  const formNames = ["招生咨询", "意见反馈", "活动报名"];
  let n = 0;

  for (const formName of formNames) {
    const formId = formIds.get(formName);
    if (!formId) throw new Error(`[seed] FormData 依赖缺失：${formName}`);

    for (let i = 1; i <= 10; i += 1) {
      n += 1;
      const id = `seed-formdata-${n}`;
      const payload =
        formName === "招生咨询"
          ? {
              name: `咨询人${i}`,
              phone: `1390000${String(2000 + i).slice(-4)}`,
              province: "本省",
              question: `第 ${i} 条招生咨询`,
            }
          : formName === "意见反馈"
            ? {
                name: `反馈人${i}`,
                email: `feedback${i}@example.com`,
                content: `第 ${i} 条意见反馈`,
              }
            : {
                name: `报名人${i}`,
                org: "XX中学",
                count: String((i % 5) + 1),
                remark: `第 ${i} 条报名备注`,
              };

      await prisma.formData.upsert({
        where: { id },
        create: {
          id,
          formId,
          data: json(payload),
          status: pick(statuses, i),
          ip: `10.2.${i}.${(hash32(id) % 250) + 1}`,
          createdAt: shift(-50 + i, i),
        },
        update: {
          formId,
          data: json(payload),
          status: pick(statuses, i),
          ip: `10.2.${i}.${(hash32(id) % 250) + 1}`,
        },
      });
    }
  }

  count("FormData", n);
}

async function seedStatistics(siteIds: IdMap): Promise<void> {
  const days = 90;
  const sources = ["search", "direct", "external"] as const;
  let n = 0;

  for (const site of SITES) {
    const siteId = siteIds.get(site.slug);
    if (!siteId) throw new Error(`[seed] Statistic 依赖缺失：${site.slug}`);

    for (let d = 0; d < days; d += 1) {
      const date = shift(-d);
      const dateKey = dateKeyOf(date);
      const h = hash32(`${dateKey}|${site.slug}`);
      const pv = 800 + (h % 2400);
      const uv = Math.round(pv * 0.45);
      const ip = Math.round(uv * 0.85);

      await prisma.statistic.upsert({
        where: { dateKey_siteId: { dateKey, siteId } },
        create: {
          dateKey,
          siteId,
          date: new Date(`${dateKey}T00:00:00.000Z`),
          pv,
          uv,
          ip,
          source: pick(sources, d + site.slug.length),
        },
        update: {
          date: new Date(`${dateKey}T00:00:00.000Z`),
          pv,
          uv,
          ip,
          source: pick(sources, d + site.slug.length),
        },
      });
      n += 1;
    }
  }

  count("Statistic", n);
}

async function seedConfigs(): Promise<void> {
  // 12 条覆盖 docs/10 §10 的 5 个分组（13 §6：约 12 / 5 组）
  const configs = [
    { key: "seo.home.title", value: "明德大学｜MINGDE UNIVERSITY", group: "seo" },
    {
      key: "seo.home.description",
      value: "明德大学官方网站，提供新闻、通知、招生与信息服务（技术演示项目）",
      group: "seo",
    },
    { key: "seo.home.keywords", value: "明德大学,高校,招生,科研", group: "seo" },
    { key: "site.name", value: "明德大学", group: "site" },
    { key: "site.address", value: "演示地址（非真实校址）", group: "site" },
    {
      key: "site.contact",
      value: "本页联系方式为演示占位，不指向真实机构或个人",
      group: "site",
    },
    { key: "security.login_max_attempts", value: "5", group: "security" },
    { key: "security.session_timeout_minutes", value: "120", group: "security" },
    { key: "watermark.enabled", value: "false", group: "watermark" },
    { key: "watermark.text", value: "明德大学", group: "watermark" },
    { key: "sensitive_words.enabled", value: "false", group: "sensitive_words" },
    { key: "sensitive_words.list", value: "[]", group: "sensitive_words" },
  ];

  for (const c of configs) {
    await prisma.config.upsert({
      where: { key: c.key },
      create: { key: c.key, value: c.value, group: c.group },
      update: { value: c.value, group: c.group },
    });
  }

  count("Config", configs.length);
}

async function seedLogs(userIds: IdMap): Promise<void> {
  const total = 40;
  const actions = [
    { type: "login", action: "登录后台", detail: "凭证登录成功" },
    { type: "operation", action: "更新文章", detail: "保存草稿并提交初审" },
    { type: "audit", action: "审核通过", detail: "pending_first → pending_final" },
    { type: "operation", action: "发布文章", detail: "pending_final → published" },
    { type: "audit", action: "退回修改", detail: "pending_final → rejected" },
  ] as const;
  const usernames = ["admin", "site_admin", "editor", "auditor"];

  for (let i = 1; i <= total; i += 1) {
    const id = `seed-log-${i}`;
    const def = pick(actions, i);
    const username = pick(usernames, i);
    const userId = userIds.get(username) ?? null;

    await prisma.log.upsert({
      where: { id },
      create: {
        id,
        type: def.type,
        userId,
        username,
        ip: `10.3.${i % 250}.${(hash32(id) % 250) + 1}`,
        action: def.action,
        detail: def.detail,
        createdAt: shift(-30 + (i % 25), i % 24, i % 60),
      },
      update: {
        type: def.type,
        userId,
        username,
        ip: `10.3.${i % 250}.${(hash32(id) % 250) + 1}`,
        action: def.action,
        detail: def.detail,
        createdAt: shift(-30 + (i % 25), i % 24, i % 60),
      },
    });
  }

  count("Log", total);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[seed] 开始（幂等；基准时间 2026-10-01T00:00:00Z）");

  // —— 站群骨架 ——
  const { siteIds } = await seedSites();
  const { channelIds } = await seedChannels(siteIds);
  await seedNavigations(siteIds, channelIds);
  await seedPages(siteIds, channelIds);

  // —— 权限体系 ——
  const roleIds = await seedRoles();
  const permissionIds = await seedPermissions();
  await seedRolePermissions(roleIds, permissionIds);
  const userIds = await seedUsers(siteIds);
  await seedUserRoles(userIds, roleIds, siteIds);

  // —— 内容 ——
  const { articleIds, publishedIds, byId } = await seedArticles(siteIds, channelIds, userIds);
  await seedArticleVersions(publishedIds, articleIds, userIds);
  await seedAuditRecords(articleIds, publishedIds, userIds, byId);
  await seedMedia(siteIds, userIds);
  await seedAttachments(publishedIds);

  // —— 互动 ——
  await seedComments(siteIds, publishedIds);
  await seedMessages();
  const formIds = await seedForms(siteIds);
  await seedFormData(formIds);

  // —— 运维 ——
  await seedStatistics(siteIds);
  await seedConfigs();
  await seedLogs(userIds);

  console.log("[seed] 汇总（本次 upsert 写入/更新的行数）：");
  for (const [model, n] of counts) {
    console.log(`  - ${model.padEnd(18)} ${n}`);
  }
  console.log("[seed] 完成");
}

main()
  .catch((error: unknown) => {
    console.error("[seed] 失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
