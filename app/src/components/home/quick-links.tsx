import {
  AccessibilityIcon,
  AwardIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarDaysIcon,
  FileTextIcon,
  FlaskConicalIcon,
  GraduationCapIcon,
  LandmarkIcon,
  LibraryIcon,
  MailIcon,
  NewspaperIcon,
  PhoneIcon,
  SchoolIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

import { Link } from "@/i18n/navigation";

/**
 * 快捷入口（T2.2）—— Server Component
 * ============================================================================
 * 布局：**移动 3 列 / 桌面 6 列**（`grid-cols-3 lg:grid-cols-6`）。
 *
 * 图标：`icon` 是**字符串名**（来自 `Navigation.icon`，如 `"School"`），
 * 用**静态映射表**解析成 lucide 组件 —— 不引入新包、不做动态 `import()`（打包器无法静态分析）。
 * 命中不到时回落 `SparklesIcon`（不抛错，保证首页永远能渲染）。
 *
 * 链接：站内走 next-intl `Link`（自动 `/en` 前缀），`http(s)` 外链新窗口打开。
 */

export type QuickLinkItem = {
  label: string;
  href: string;
  /** lucide 图标名，大小写与分隔符不敏感（`"GraduationCap"` / `"graduation-cap"` 等价） */
  icon?: string | null;
};

/** 图标名 → 组件（键统一小写去分隔符） */
const ICONS: Record<string, LucideIcon> = {
  school: SchoolIcon,
  newspaper: NewspaperIcon,
  graduationcap: GraduationCapIcon,
  users: UsersIcon,
  flaskconical: FlaskConicalIcon,
  filetext: FileTextIcon,
  building2: Building2Icon,
  bookopen: BookOpenIcon,
  library: LibraryIcon,
  award: AwardIcon,
  landmark: LandmarkIcon,
  calendardays: CalendarDaysIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  search: SearchIcon,
  accessibility: AccessibilityIcon,
};

function iconOf(name?: string | null): LucideIcon {
  if (!name) {
    return SparklesIcon;
  }
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ICONS[key] ?? SparklesIcon;
}

type QuickLinksProps = {
  links: QuickLinkItem[];
  className?: string;
};

export function QuickLinks({ links, className }: QuickLinksProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <ul className={cn("grid grid-cols-3 gap-3 lg:grid-cols-6", className)}>
      {links.map((link) => {
        const Icon = iconOf(link.icon);
        const external = /^https?:\/\//i.test(link.href);
        const itemClass =
          "flex flex-col items-center gap-2 rounded-card border border-border bg-card p-4 text-center shadow-card transition-colors duration-200 hover:border-primary/40 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
        const body = (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-surface text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-foreground">{link.label}</span>
          </>
        );

        return (
          <li key={`${link.href}-${link.label}`}>
            {external ? (
              <a href={link.href} target="_blank" rel="noreferrer" className={itemClass}>
                {body}
              </a>
            ) : (
              <Link href={link.href} className={itemClass}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
