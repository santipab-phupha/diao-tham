/** Model languages describe the message, independently of the interface language. */
export function messageLanguages(text: string): string[] {
  // The instruction prompt is English. Preserve Thai task titles/evidence when present.
  return /[\u0E00-\u0E7F]/u.test(text) ? ['en', 'th'] : ['en'];
}
