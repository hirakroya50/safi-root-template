export interface ChatReply {
  reply: string
  conversationId: string
}

export class ChatRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChatRequestError'
    this.status = status
  }
}

export async function postChat(message: string, conversationId?: string): Promise<ChatReply> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        ...(conversationId ? { conversationId } : {}),
      }),
    })
  } catch {
    throw new ChatRequestError('Could not reach Lotus AI Chat. Check your connection and try again.', 0)
  }

  const payload = (await response.json().catch(() => null)) as
    | { reply?: unknown; conversationId?: unknown; error?: { message?: unknown } }
    | null

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Lotus AI Chat could not answer just now. Try again.'
    throw new ChatRequestError(message, response.status)
  }

  if (!payload || typeof payload.reply !== 'string' || typeof payload.conversationId !== 'string') {
    throw new ChatRequestError('Lotus AI Chat returned an unexpected response.', response.status)
  }

  return { reply: payload.reply, conversationId: payload.conversationId }
}
