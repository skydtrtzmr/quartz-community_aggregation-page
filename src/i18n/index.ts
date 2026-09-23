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
