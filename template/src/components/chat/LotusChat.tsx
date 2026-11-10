import { useEffect, useId, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useBranding } from '../BrandingProvider'
import { ChatRequestError, postChat } from './client'

interface Bubble {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface StoredChat {
  conversationId?: string
  bubbles: Bubble[]
}

function storageKey(appId: string): string {
  return `lotus-ai-chat:${appId}`
}

function bubbleId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `lotus-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
}

function loadChat(appId: string): StoredChat {
  try {
    const raw = sessionStorage.getItem(storageKey(appId))
    if (!raw) return { bubbles: [] }
    const parsed = JSON.parse(raw) as StoredChat
    const bubbles = Array.isArray(parsed.bubbles)
      ? parsed.bubbles.filter(
          (bubble) =>
            bubble &&
            (bubble.role === 'user' || bubble.role === 'assistant') &&
            typeof bubble.text === 'string' &&
            typeof bubble.id === 'string',
        )
      : []
    return {
      bubbles,
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : undefined,
    }
  } catch {
    return { bubbles: [] }
  }
}

export const LotusChat: FC = () => {
  const config = useBranding()
  const titleId = useId()
  const panelId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const initial = loadChat(config.appId)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [bubbles, setBubbles] = useState<Bubble[]>(initial.bubbles)
  const [conversationId, setConversationId] = useState<string | undefined>(initial.conversationId)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [retryMessage, setRetryMessage] = useState('')

  useEffect(() => {
    const next = loadChat(config.appId)
    setBubbles(next.bubbles)
    setConversationId(next.conversationId)
    setError('')
    setRetryMessage('')
  }, [config.appId])

  useEffect(() => {
    sessionStorage.setItem(
      storageKey(config.appId),
      JSON.stringify({ conversationId, bubbles }),
    )
  }, [bubbles, config.appId, conversationId])

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [bubbles, sending, error, open])

  async function ask(message: string, appendUser: boolean) {
    const trimmed = message.trim()
    if (!trimmed || sending) return
    setError('')
    setRetryMessage('')
    if (appendUser) {
      setBubbles((current) => [
        ...current,
        { id: bubbleId(), role: 'user', text: trimmed },
      ])
      setDraft('')
    }
    setSending(true)
    try {
      const result = await postChat(trimmed, conversationId)
      setConversationId(result.conversationId)
      setBubbles((current) => [
        ...current,
        { id: bubbleId(), role: 'assistant', text: result.reply },
      ])
    } catch (caught) {
      const message =
        caught instanceof ChatRequestError
          ? caught.message
          : 'Lotus AI Chat could not answer just now. Try again.'
      setError(message)
      setRetryMessage(trimmed)
    } finally {
      setSending(false)
    }
  }

  function onDraftKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask(draft, true)
    }
  }

  function clearChat() {
    setBubbles([])
    setConversationId(undefined)
    setError('')
    setRetryMessage('')
    setDraft('')
    sessionStorage.removeItem(storageKey(config.appId))
    inputRef.current?.focus()
  }

  const welcome = `Hello. I am Lotus AI Chat. Ask me about ${config.displayName}.`

  return (
    <>
      <section className="safi-chat-pane" data-safi-chat aria-label="Lotus AI Chat">
        <div className="safi-chat-heading">
          <span className="safi-chat-label">Lotus AI Chat</span>
          <p>Questions are answered from this website&apos;s business details.</p>
        </div>
        <button type="button" className="safi-action lotus-open" onClick={() => setOpen(true)}>
          Ask about this business
        </button>
      </section>

      {open ? (
        <section
          className="lotus-panel"
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header className="lotus-panel-bar">
            <div>
              <h2 id={titleId}>Lotus AI Chat</h2>
              <p>{config.displayName}</p>
            </div>
            <div className="lotus-panel-actions">
              <button type="button" onClick={clearChat}>
                New chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  launcherRef.current?.focus()
                }}
              >
                Close chat
              </button>
            </div>
          </header>

          <div className="lotus-log" role="log" aria-live="polite" aria-relevant="additions">
            {bubbles.length === 0 ? (
              <p className="lotus-bubble lotus-bubble-assistant">{welcome}</p>
            ) : null}
            {bubbles.map((bubble) => (
              <p key={bubble.id} className={`lotus-bubble lotus-bubble-${bubble.role}`}>
                <span className="safi-visually-hidden">
                  {bubble.role === 'user' ? 'You' : 'Lotus AI Chat'}:{' '}
                </span>
                {bubble.text}
              </p>
            ))}
            {sending ? (
              <p className="lotus-typing" role="status">
                Lotus AI Chat is typing
                <span aria-hidden="true">...</span>
              </p>
            ) : null}
            {error ? (
              <div className="lotus-error" role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => void ask(retryMessage, false)} disabled={sending}>
                  Retry
                </button>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            className="lotus-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(draft, true)
            }}
          >
            <label className="safi-visually-hidden" htmlFor="lotus-chat-input">
              Message Lotus AI Chat
            </label>
            <textarea
              id="lotus-chat-input"
              ref={inputRef}
              rows={2}
              maxLength={2000}
              value={draft}
              placeholder={`Ask about ${config.displayName}`}
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <button type="submit" disabled={sending || draft.trim().length === 0}>
              Send
            </button>
            <p className="lotus-hint">Enter to send. Shift+Enter for a new line.</p>
          </form>
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        className="lotus-launcher"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Lotus AI Chat
      </button>
    </>
  )
}
