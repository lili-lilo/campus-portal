"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { coverStyle } from "@/components/article-card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Link } from "@/i18n/navigation";

/**
 * 焦点图轮播（T2.2）—— **Client Component**（shadcn `carousel`/embla 是交互组件）
 * ============================================================================
 * · 输入 `items: Array<{ id, title, image?, link }>`
 * · **图片兜底（T2.1 裁决 #1 / `docs/00` §8 #50）**：`image` 为空 → 直接渲染 token 渐变块 +
 *   居中标题；`image` 存在但**加载失败** → `onError` 标记该条为 broken，卸载 `<img>` 并露出同一渐变块
 *   （两次兜底都走 `coverStyle(index)` 的 4 套渐变轮转）
 * · 自动播放 **5s**；**鼠标悬停 / 键盘聚焦时暂停**；右下角有"暂停/播放"切换（`aria-pressed`）
 * · 尺寸：移动 `h-[200px]` / 桌面 `md:h-[400px]`
 *
 * 无障碍：容器 `aria-roledescription="carousel"`；有图时标题叠在**底部渐变遮罩**上（`text-background`），
 * 无图时标题居中于渐变块。⚠ 左右箭头按钮内的 sr-only 文案（"Previous slide"/"Next slide"）是
 * `ui/carousel.tsx` 内置英文，且该文件属冻结范围 → 本轮**不改**（见 T2.8 Part 1 报告"未覆盖项"）。
 */

export type HeroSlide = {
  id: string;
  title: string;
  image?: string | null;
  /** 站内路径（如 `/main/news/xxx`） */
  link: string;
};

const AUTOPLAY_MS = 5000;

type HeroCarouselProps = {
  items: HeroSlide[];
  className?: string;
};

export function HeroCarousel({ items, className }: HeroCarouselProps) {
  // Client Component → `useTranslations`（messages 由 [locale]/layout.tsx 的 NextIntlClientProvider 下发）
  const t = useTranslations("home");

  const [api, setApi] = useState<CarouselApi>();
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [broken, setBroken] = useState<readonly string[]>([]);

  // 自动播放：5s 一张；悬停/聚焦暂停或手动关闭时清掉定时器
  useEffect(() => {
    if (!api || !playing || paused) {
      return;
    }
    const timer = window.setInterval(() => {
      api.scrollNext();
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [api, playing, paused]);

  if (items.length === 0) {
    return null;
  }

  const markBroken = (id: string) => {
    setBroken((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <section
      aria-label={t("heroLabel")}
      aria-roledescription="carousel"
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Carousel opts={{ loop: true, align: "start" }} setApi={setApi} className="w-full">
        <CarouselContent>
          {items.map((item, index) => {
            const style = coverStyle(index);
            const showImage = Boolean(item.image) && !broken.includes(item.id);

            return (
              <CarouselItem key={item.id} className="basis-full">
                <Link
                  href={item.link}
                  className="group relative block h-[200px] overflow-hidden rounded-card md:h-[400px]"
                >
                  {/* 渐变兜底层：无论有没有图都在最底层，图挂时自动露出 */}
                  <span className={cn("absolute inset-0", style.bg)} aria-hidden="true" />

                  {showImage && item.image ? (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      unoptimized
                      sizes="100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      onError={() => markBroken(item.id)}
                    />
                  ) : null}

                  {showImage ? (
                    <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-foreground/85 via-foreground/40 to-transparent p-6">
                      <span className="line-clamp-2 font-heading text-lg font-semibold text-background md:text-2xl">
                        {item.title}
                      </span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "absolute inset-0 flex items-center justify-center p-6 text-center font-heading text-lg font-semibold md:text-2xl",
                        style.text,
                      )}
                    >
                      {item.title}
                    </span>
                  )}
                </Link>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <CarouselPrevious className="left-3 hidden md:inline-flex" />
        <CarouselNext className="right-3 hidden md:inline-flex" />
      </Carousel>

      {/* 自动播放开关：可关闭（悬停暂停之外的第二条出路，键盘可达） */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={!playing}
        onClick={() => setPlaying((value) => !value)}
        className="absolute right-3 bottom-3 z-10 bg-background/90 backdrop-blur"
      >
        {playing ? (
          <PauseIcon className="size-4" aria-hidden="true" />
        ) : (
          <PlayIcon className="size-4" aria-hidden="true" />
        )}
        {playing ? t("pause") : t("play")}
      </Button>
    </section>
  );
}
