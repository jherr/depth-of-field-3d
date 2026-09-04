import { useEffect, useRef, useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'
import { SIM_TOOLS } from './tools.ts'

const tools = clientTools(...SIM_TOOLS)
type ChatMessage = UIMessage<typeof tools>

/** What each tool is doing, in the present tense, for the activity line. */
const RUNNING: Record<string, string> = {
  describeScene: 'Reading the scene',
  addProp: 'Adding a prop',
  moveProp: 'Moving a prop',
  removeProp: 'Removing a prop',
  setCamera: 'Adjusting the camera',
  focusOn: 'Pulling focus',
  snapshot: 'Looking at the render',
}

const SUGGESTIONS = [
  'What would make the background blurrier?',
  'Put a lamp behind the subject and show me the bokeh',
  'Focus on the vase and take a look',
  'Set up a classic 85mm portrait',
]

/**
 * One tool call, shown as a line rather than a JSON dump.
 *
 * The arguments are the interesting part while it runs and the result is
 * interesting only when it failed, so a successful call collapses to its name.
 * The exception is `snapshot`: its output is an image the model looked at, and
 * showing the same image to the human is what makes the whole thing legible.
 */
function ToolCall({ part }: { part: Extract<ChatMessage['parts'][number], { type: 'tool-call' }> }) {
  const done = part.output !== undefined
  const label = RUNNING[part.name] ?? part.name

  type ImagePart = { type?: string; source?: { value?: string; mimeType?: string } }
  const image = Array.isArray(part.output)
    ? (part.output as Array<ImagePart>).find((p) => p?.type === 'image')
    : undefined

  return (
    <div className="chat-tool">
      <span className={`chat-tool-dot${done ? ' is-done' : ''}`} aria-hidden />
      <div className="chat-tool-body">
        <span className="chat-tool-name">
          {label}
          {!done && <span className="chat-tool-ellipsis" />}
        </span>
        {image?.source?.value && (
          <img
            className="chat-shot"
            src={`data:${image.source.mimeType ?? 'image/png'};base64,${image.source.value}`}
            alt={`${part.name} result`}
          />
        )}
      </div>
    </div>
  )
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`chat-msg${isUser ? ' is-user' : ''}`}>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return part.content ? (
            <p key={`t${i}`} className="chat-text">
              {part.content}
            </p>
          ) : null
        }
        if (part.type === 'tool-call') return <ToolCall key={part.id} part={part} />
        return null
      })}
    </div>
  )
}

export function ChatPanel() {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, isLoading, error, stop } = useChat({
    threadId: 'dof-assistant',
    connection: fetchServerSentEvents('/api/chat'),
    tools,
  })

  // Follow the tail as tool calls and tokens stream in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setDraft('')
    sendMessage(trimmed)
  }

  return (
    <section className="chat-panel" aria-label="Assistant">
      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>
              Ask for a change and it will move props, set the camera, and look at the render to
              check its own work.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chat-suggestion" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          (messages as Array<ChatMessage>).map((m) => <Message key={m.id} message={m} />)
        )}

        {error && <p className="chat-error">{error.message}</p>}
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <textarea
          className="chat-input"
          value={draft}
          rows={2}
          placeholder="Ask for a change..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, shift+enter breaks the line -- the composer is two
            // rows tall precisely because prompts here are often two sentences.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
        />
        {isLoading ? (
          <button type="button" className="chat-send is-stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="chat-send" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  )
}
