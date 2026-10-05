import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { CountUp } from "@/components/home/count-up";

/**
 * 数字看板（M6 视觉改造批次 2）—— **Server Component**
 * ============================================================================
 * · 品牌主色深色**通栏**（`bg-[#0b2d5e]` = `--primary`）；内容用 `max-w-page` 容器对齐
 * · 6 个数字横排：**桌面 6 列 / 平板 3 列 / 手机 2 列**
 * · 计数动效下沉到 Client 岛 `CountUp`（motion `useInView` + `animate`，尊重 reduced-motion），
 *   本组件保持 Server（文案与数字都在服务端备好，客户端只负责动画）
 * · ⚠ 全部数字为**虚构设定**（与"明德大学"品牌自洽的演示数据），不指向任何真实机构的统计
 */
export async function StatsBand({ className }: { className?: string }) {
  const t = await getTranslations("home");

  const stats = [
    { value: 1923, suffix: "", label: t("statFounded") },
    { value: 18, suffix: "", label: t("statSchools") },
    { value: 24000, suffix: "+", label: t("statStudents") },
    { value: 2800, suffix: "+", label: t("statStaff") },
    { value: 120, suffix: "+", label: t("statPartners") },
    { value: 9, suffix: "", label: t("statAcademicians") },
  ] as const;

  return (
    <section aria-label={t("statsLabel")} className={cn("w-full bg-[#0b2d5e]", className)}>
      <ul className="mx-auto grid w-full max-w-page grid-cols-2 gap-x-6 gap-y-10 px-gutter py-12 sm:grid-cols-3 md:py-16 lg:grid-cols-6">
        {stats.map((stat) => (
          <li key={stat.label} className="text-center lg:text-left">
            <CountUp
              value={stat.value}
              suffix={stat.suffix}
              className="block font-heading text-4xl font-semibold text-white tabular-nums md:text-5xl"
            />
            <span className="mt-2 block text-sm text-white/70">{stat.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
