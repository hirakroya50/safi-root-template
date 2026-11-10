export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface Thread {
  messages: ChatTurn[]
  touched: number
}

export interface ConversationStore {
  begin(visitor: string, requestedId: string | undefined, now: number): { id: string; messages: ChatTurn[] }
  commit(visitor: string, id: string, user: string, assistant: string, now: number): void
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createConversationStore(historyLimit: number, maxThreads = 500): ConversationStore {
  const threads = new Map<string, Thread>()

  function key(visitor: string, id: string): string {
    return `${visitor}\n${id}`
  }

  function trim(thread: Thread): void {
    const cap = Math.max(2, historyLimit * 2)
    if (thread.messages.length > cap) {
      thread.messages.splice(0, thread.messages.length - cap)
    }
  }

  return {
    begin(visitor, requestedId, now) {
      if (requestedId && ID_PATTERN.test(requestedId)) {
        const existing = threads.get(key(visitor, requestedId))
        if (existing) {
          existing.touched = now
          return { id: requestedId, messages: existing.messages.map((turn) => ({ ...turn })) }
        }
      }
      const id = crypto.randomUUID()
      threads.set(key(visitor, id), { messages: [], touched: now })
      if (threads.size > maxThreads) {
        const oldest = threads.keys().next().value
        if (oldest) threads.delete(oldest)
      }
      return { id, messages: [] }
    },
    commit(visitor, id, user, assistant, now) {
      const thread = threads.get(key(visitor, id)) ?? { messages: [], touched: now }
      thread.messages.push({ role: 'user', content: user }, { role: 'assistant', content: assistant })
      thread.touched = now
      trim(thread)
      threads.set(key(visitor, id), thread)
    },
  }
}

export function trimHistory(messages: ChatTurn[], budget: number): ChatTurn[] {
  const selected: ChatTurn[] = []
  let size = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turn = messages[index]
    if (selected.length > 0 && size + turn.content.length > budget) break
    selected.push(turn)
    size += turn.content.length
  }
  return selected.reverse()
}
