# 本目录由 T1.1 创建，用于存放 Prisma schema、迁移与种子脚本。
#
# 各文件的创建时点与责任人（均为 T1.x 任务）：
#   schema.prisma    → T1.4（24 个 model，内容见 docs/13-数据模型-v2.md §2）
#   seed.ts          → T1.5（幂等 upsert，映射见 docs/10-种子数据说明.md §6）
#   migrations/      → T1.4 首次 `pnpm db:migrate` 时自动生成
#   dev.db           → T1.4 首次 migrate 时生成（SQLite，**不进仓库**）
#
# 注意：本文件（README.md）不是 Prisma 的必需文件，仅用于说明目录用途。
