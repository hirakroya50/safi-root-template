import type { InstanceConfig } from '../config.ts'

export interface Passage {
  id: string
  title: string
  text: string
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'what', 'does', 'who', 'why',
  'how', 'when', 'where', 'your', 'you', 'are', 'can', 'our', 'from', 'have',
  'has', 'was', 'please', 'could', 'would', 'tell', 'about', 'into', 'than',
  'then', 'them', 'they', 'its', 'not', 'but', 'all', 'any', 'company',
  'provide', 'does', 'did', 'just', 'me',
])

export function passagesFromConfig(config: InstanceConfig): Passage[] {
  const passages: Passage[] = [
    {
      id: 'identity',
      title: config.displayName,
      text: [config.displayName, config.subtitle, config.intro].filter(Boolean).join('. '),
    },
  ]

  if (config.about.trim()) {
    passages.push({
      id: 'about',
      title: config.sections.about,
      text: config.about,
    })
  }

  if (config.offerings.length > 0) {
    passages.push({
      id: 'catalog',
      title: config.sections.offerings,
      text: `${config.sections.offerings}: ${config.offerings.map((item) => item.title).join(', ')}`,
    })
  }

  config.highlights.forEach((item, index) => {
    passages.push({
      id: `highlight:${index}:${item.label}`,
      title: item.label,
      text: `${item.label}: ${item.value}`,
    })
  })

  config.offerings.forEach((item, index) => {
    passages.push({
      id: `offering:${index}:${item.title}`,
      title: item.title,
      text: [item.meta, item.title, item.detail].filter(Boolean).join('. '),
    })
  })

  config.contact.forEach((item, index) => {
    passages.push({
      id: `contact:${index}:${item.label}`,
      title: item.label,
      text: `${item.label}: ${item.value}`,
    })
  })

  return passages
}

function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 2 && !STOP.has(token),
  )
}

export function buildBusinessContext(
  config: InstanceConfig,
  query: string,
  budget: number,
): { text: string; passageIds: string[] } {
  const passages = passagesFromConfig(config)
  const queryTokens = tokens(query)
  const identity = passages.find((passage) => passage.id === 'identity')
  const rest = passages.filter((passage) => passage.id !== 'identity')

  const ranked = rest
    .map((passage) => {
      const haystack = new Set(tokens(`${passage.title} ${passage.text}`))
      let score = 0
      for (const token of queryTokens) {
        if (haystack.has(token)) score += 1
      }
      return { passage, score }
    })
    .sort((left, right) => right.score - left.score || left.passage.id.localeCompare(right.passage.id))

  const matched = ranked.filter((item) => item.score > 0)
  const ordered = (matched.length > 0 ? matched : ranked).map((item) => item.passage)
  if (ordered.some((passage) => passage.id === 'catalog')) {
    for (const passage of rest) {
      if (passage.id.startsWith('offering:') && !ordered.includes(passage)) ordered.push(passage)
    }
  }
  const chosen: Passage[] = identity ? [identity] : []
  let size = chosen.reduce((total, passage) => total + passage.text.length + 2, 0)

  for (const passage of ordered) {
    const next = passage.text.length + 2
    if (chosen.length > 0 && size + next > budget) continue
    chosen.push(passage)
    size += next
  }

  return {
    text: chosen.map((passage) => passage.text).join('\n'),
    passageIds: chosen.map((passage) => passage.id),
  }
}
