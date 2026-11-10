export type ChatErrorCode =
  | 'empty_message'
  | 'invalid_message'
  | 'message_too_long'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'upstream'

const VISITOR_MESSAGES: Record<ChatErrorCode, string> = {
  empty_message: 'Enter a message before sending.',
  invalid_message: 'That message could not be read. Try a short question.',
  message_too_long: 'That message is too long. Try a shorter question.',
  payload_too_large: 'That request is too large.',
  rate_limited: 'Too many messages. Wait a moment and try again.',
  unavailable: 'Lotus AI Chat is temporarily unavailable.',
  timeout: 'Lotus AI Chat took too long to answer. Try again.',
  upstream: 'Lotus AI Chat could not answer just now. Try again.',
}

export function visitorMessage(code: ChatErrorCode): string {
  return VISITOR_MESSAGES[code]
}

export class ChatFailure extends Error {
  readonly code: ChatErrorCode

  constructor(code: ChatErrorCode) {
    super(visitorMessage(code))
    this.name = 'ChatFailure'
    this.code = code
  }
}
