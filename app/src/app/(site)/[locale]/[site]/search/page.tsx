import type { Metadata } from "next";
import { SearchIcon } from "lucide-react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { articleHref } from "@/components/article-card";
import { ListPagination } from "@/components/list-pagination";
import { SearchHighlight, type SearchHighlights } from "@/components/search-highlight";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatListDate } from "@/lib/date";
import { getSiteContext } from "@/lib/site-context";

/** 搜索页标题本地化（T2.8 Part 1 收口）：`locale` 由参数提供，可用 next-intl 的类型化重载 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });

  return { title: t("title") };
}

// SSR：docs/15 §6 规定搜索页不做 ISR（revalidate: 0）
export const revalidate = 0;

/** `GET /api/search` 的返回形状（docs/14 §2.1 / §5.16） */
type SearchApiHit = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  highlights: SearchHighlights;
  channel: { name: string; slug: string } | null;
  publishTime: string | null;
};

type SearchApiData = {
  items: SearchApiHit[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

/**
 * 自调本项目的 Route Handler（docs/14 §5.16）—— **页面与外部消费者共用同一实现**，
 * 避免"页面直查 Prisma + 另写一份 API"的双实现漂移。
 * 由于用了 `headers()` 与 `cache: "no-store"`，本页必然是**动态渲染**（构建期不会发这次请求）。
 */
async function fetchSearch(
  siteSlug: string,
  query: string,
  page: string | undefined,
  /** 传入页面已取的 `search` 命名空间翻译器（兜底文案走 i18n） */
  t: (key: "error" | "unavailable") => string,
): Promise<{ data: SearchApiData | null; error: string | null }> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";

  const url = new URL(`${protocol}://${host}/api/search`);
  url.searchParams.set("site", siteSlug);
  url.searchParams.set("q", query);
  if (page) {
    url.searchParams.set("page", page);
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json()) as {
      ok: boolean;
      data?: SearchApiData;
      message?: string;
    };

    if (!payload.ok || !payload.data) {
      // 例如关键词超 50 字 → API 返回 VALIDATION_FAILED 的中文 message，这里直接展示
      return { data: null, error: payload.message ?? t("error") };
    }

    return { data: payload.data, error: null };
  } catch {
    return { data: null, error: t("unavailable") };
  }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; site: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale, site: siteSlug } = await params;
  const { q: rawQuery, page: rawPage } = await searchParams;

  const query = (rawQuery ?? "").trim();

  // Server Component → `getTranslations`（search 命名空间 + common 的"搜索"按钮文案）
  const t = await getTranslations("search");
  const tCommon = await getTranslations("common");

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  const result = query.length > 0 ? await fetchSearch(siteSlug, query, rawPage, t) : null;
  const data = result?.data ?? null;

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-gutter py-section-sm">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {t("title")}
      </h1>

      {/* ① 输入框：GET 表单（不写 action → 提交到当前 URL，天然带 locale 前缀且会重置 page） */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="search-q" className="sr-only">
          搜索关键词
        </label>{" "}
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={50}
          placeholder={t("placeholder")}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors duration-200 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button type="submit" className={buttonVariants({ variant: "default", size: "lg" })}>
          <SearchIcon className="size-4" aria-hidden="true" />
          {tCommon("search")}
        </button>
      </form>

      {/* ② 三种状态：空关键词 / 出错 / 结果 */}
      {query.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
          {t("emptyQuery")}
        </p>
      ) : result?.error ? (
        <p
          role="alert"
          className="rounded-card border border-destructive/40 bg-destructive/5 p-card text-sm text-destructive"
        >
          {result.error}
        </p>
      ) : !data || data.total === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
          {t("notFound", { query })}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("found", { count: data.total, query })}
          </p>

          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {data.items.map((hit) => {
              // 复用 T2.2 的链接规则（唯一实现）：只传它需要的字段 ——
              // API 的 publishTime 是 ISO **字符串**，与 ArticleItem 的 Date 不同型
              const href =
                articleHref(
                  { id: hit.id, title: hit.title, slug: hit.slug, channel: hit.channel },
                  siteSlug,
                ) ?? `/${siteSlug}/search`;

              return (
                <li key={hit.id} className="space-y-2 px-4 py-4">
                  <h2 className="font-heading text-base leading-body font-semibold">
                    <Link
                      href={href}
                      className="rounded text-foreground transition-colors duration-200 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {/* 标题命中 → 渲染服务端拼接的高亮片段；未命中 → 纯文本标题 */}
                      {hit.highlights.title.length > 0 ? (
                        <SearchHighlight segments={hit.highlights.title} />
                      ) : (
                        hit.title
                      )}
                    </Link>
                  </h2>

                  {hit.highlights.content.length > 0 ? (
                    <p className="text-sm leading-body text-muted-foreground">
                      <SearchHighlight segments={hit.highlights.content} />
                    </p>
                  ) : hit.summary ? (
                    <p className="line-clamp-2 text-sm leading-body text-muted-foreground">
                      {hit.summary}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {hit.channel ? (
                      <Link
                        href={`/${siteSlug}/${hit.channel.slug}`}
                        className="hover:text-primary"
                      >
                        {hit.channel.name}
                      </Link>
                    ) : null}
                    <span>
                      {formatListDate(hit.publishTime ? new Date(hit.publishTime) : null)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* ③ 分页：保留 q，翻页链接形如 `?q=xxx&page=2` */}
          <ListPagination
            page={data.page}
            totalPages={data.totalPages}
            basePath={`/${siteSlug}/search`}
            query={{ q: query }}
            locale={locale}
          />
        </>
      )}
    </div>
  );
}
