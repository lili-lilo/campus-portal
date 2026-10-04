/**
 * db:reset 安全门（M6 Step 4b）
 * ============================================================================
 * 本地与生产**共用同一份 Supabase PostgreSQL**（方案 A），而
 * `prisma migrate reset --force` 会**清空整个数据库**，故必须先显式确认：
 *
 *   ALLOW_DB_RESET=1 pnpm db:reset      # POSIX
 *   $env:ALLOW_DB_RESET="1"; pnpm db:reset   # PowerShell
 */
if (process.env.ALLOW_DB_RESET !== "1") {
  console.error("REFUSING: db:reset 会清空数据库。确认请先设 ALLOW_DB_RESET=1。");
  process.exit(1);
}
