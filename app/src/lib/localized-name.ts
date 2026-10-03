/**
 * 数据名双语回退（M5-1 / `docs/00` §8 #58）
 * ============================================================================
 * `Channel.name` / `Navigation.name` 是 **DB 单语字段**（seed 写中文），M5-1 起各加
 * 可空 `nameEn`。读的时候统一走这一条规则，避免各处自己写 `locale === "en"`：
 *
 *   · `locale === "en"` **且** `nameEn` 非空 → `nameEn`
 *   · 其余（`zh` / 未填英文名 / 旧数据） → `name`
 *
 * 有意做的取舍：
 *   · 只认 `"en"` ⇒ 将来加 `ja` 等语言时在这里扩成映射表，调用点不必改
 *   · 本模块**零依赖**（不 import prisma / next-intl）⇒ Server 与 Client 组件都能直接用
 */

export type LocalizableName = {
  name: string;
  nameEn?: string | null;
};

export function localizedName(entity: LocalizableName, locale: string): string {
  return locale === "en" && entity.nameEn ? entity.nameEn : entity.name;
}
