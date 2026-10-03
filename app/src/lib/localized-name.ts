/**
 * 数据文案双语回退（M5-1 / M5-1b-1 补 · `docs/00` §8 #58）
 * ============================================================================
 * `Channel.name` / `Navigation.name` / `Site.name` / `Site.description` 都是 **DB 单语字段**
 * （seed 写中文），M5-1 起依次补了可空 `nameEn` / `descriptionEn`。读的时候统一走这两条规则，
 * 避免各处自己写 `locale === "en"`：
 *
 *   · `locale === "en"` **且** 英文列非空 → 用英文列
 *   · 其余（`zh` / 未填英文 / 旧数据） → 用中文字段
 *
 * 有意做的取舍：
 *   · 只认 `"en"` ⇒ 将来加 `ja` 等语言时在这里扩成映射表，调用点不必改
 *   · 本模块**零依赖**（不 import prisma / next-intl）⇒ Server 与 Client 组件都能直接用
 */

export type LocalizableName = {
  name: string;
  nameEn?: string | null;
};

export type LocalizableDescription = {
  description?: string | null;
  descriptionEn?: string | null;
};

export function localizedName(entity: LocalizableName, locale: string): string {
  return locale === "en" && entity.nameEn ? entity.nameEn : entity.name;
}

/** 简介双语回退；两者都空时返回 `""`（调用方按空串判空） */
export function localizedDescription(entity: LocalizableDescription, locale: string): string {
  return locale === "en" && entity.descriptionEn
    ? entity.descriptionEn
    : (entity.description ?? "");
}
