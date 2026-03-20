export type TextTransform = (text: string) => string

export const TEXT_TRANSFORM_REGISTRY: Record<string, TextTransform> = {
  'strip-urls': text =>
    text
      .replace(/https?:\/\/[^\s)]+/g, '')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim(),
  'strip-mentions': text =>
    text
      .replace(/(?<!\w)@(\w{1,15})\b/g, '')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim(),
  'normalize-whitespace': text =>
    text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]{2,}/g, ' ')
      .trim()
}

export function composeTextTransforms(slugs: string[]): TextTransform {
  const transforms = slugs
    .map(slug => TEXT_TRANSFORM_REGISTRY[slug])
    .filter((fn): fn is TextTransform => typeof fn === 'function')
  return (text: string) => transforms.reduce((acc, fn) => fn(acc), text)
}
