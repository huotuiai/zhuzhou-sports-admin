export function validateOptionalVrUrl(value: string | undefined): string | null {
  const text = value?.trim() ?? ''
  if (!text) return null
  try {
    const url = new URL(text)
    if (/^https?:\/\//i.test(text) && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname) return null
  }
  catch {
    // 非空内容必须是可打开的 HTTP(S) 绝对地址。
  }
  return '请输入以 http:// 或 https:// 开头的有效 VR 链接'
}
