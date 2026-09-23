import enUS from "./locales/en-US"
import zhCN from "./locales/zh-CN"

const locales: Record<string, typeof enUS> = {
  "en-US": enUS,
  "zh-CN": zhCN,
}

/** 取当前语言的文案，未覆盖的语言回退 en-US（与社区插件同款做法） */
export function i18n(locale: string) {
  return locales[locale] ?? enUS
}

/** 极简模板替换：`{field}` / `{count}` 占位符 */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}
