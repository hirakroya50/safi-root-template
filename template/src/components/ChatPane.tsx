import type { FC } from 'react'
import { LotusChat } from './chat/LotusChat'

/**
 * Named boundary for Lotus AI Chat.
 * The widget talks to the same-origin /api/chat route.
 * Company facts come from the validated instance configuration, not from this component.
 */
export const ChatPane: FC = () => {
  return <LotusChat />
}
