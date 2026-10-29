import React from 'react'

/**
 * Named boundary for a future assistant-ui and Windmill Chat SDK integration.
 * The pane is a demo. It does not send messages or invent replies.
 */
export const ChatPane: React.FC = () => {
  return (
    <section className="safi-chat-pane" data-safi-chat aria-label="Demo chat">
      <div className="safi-chat-heading">
        <span className="safi-chat-label">Demo Chat (nonfunctional)</span>
        <p>Reserved for a future assistant. Nothing you type here is sent.</p>
      </div>
      <form
        className="safi-chat-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="safi-visually-hidden" htmlFor="safi-chat-input">
          Message
        </label>
        <input
          id="safi-chat-input"
          disabled
          placeholder="Chat is a demo"
          autoComplete="off"
        />
        <button type="button" disabled>
          Send
        </button>
      </form>
    </section>
  )
}
