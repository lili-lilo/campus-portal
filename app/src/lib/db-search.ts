/**
 * 大小写不敏感 contains（M6-5 双轨）
 * ============================================================================
 * `mode: "insensitive"` 是 **PostgreSQL / MongoDB 专属**：SQLite 轨生成的客户端里
 * `StringFilter` **根本没有 `mode` 字段**，直接写字面量会 **TS2353**（实测）。
 *
 * 按 `DATABASE_URL` 前缀分流：
 *   · `file:`        → SQLite：只给 `contains`（SQLite 的 `LIKE` 对 ASCII 本就不区分大小写）
 *   · `postgresql:`  → PG：附 `mode: "insensitive"`
 *
 * 两个刻意的实现细节：
 *   1. **不引用 `Prisma.QueryMode`** —— 该枚举在 SQLite 轨生成的客户端里不一定存在；
 *      用字符串字面量 `"insensitive" as const` 更稳（实测两轨客户端都能接受）。
 *   2. 返回值是**联合类型**（不是新建的对象字面量）⇒ 结构化赋值允许"多一个 `mode` 属性"，
 *      因此 SQLite 轨的 `StringFilter` 也能收下它。已实测：`tsc --strict` 下
 *      PG 客户端与 SQLite 客户端各调一次**均通过，无需类型断言**。
 *
 * ⚠ 两轨行为**不完全等价**：SQLite 仅对 ASCII 大小写不敏感、PG 则严格按 `mode` 处理；
 * 中文检索不受影响（无大小写概念）。
 * 参考：`docs/11` A31（双轨裁决）、`app/scripts/gen-sqlite-schema.mjs`。
 */

const isSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:");

/** 构造大小写不敏感的 `contains` 过滤（两轨各自的最优写法） */
export function containsCI(query: string) {
  return isSqlite ? { contains: query } : { contains: query, mode: "insensitive" as const };
}
