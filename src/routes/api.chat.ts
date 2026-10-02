import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { TOOL_DEFS } from '#/features/dof/ai/tools.ts'

/**
 * The assistant's server half.
 *
 * Deliberately thin. Every tool runs in the browser, because that is where the
 * scene store and the WebGL canvas are, so this route contributes no
 * implementations -- `TOOL_DEFS` gives the model the shapes and
 * `mergeAgentTools` pairs each one with the handler the request carried.
 * Everything this route really does is hold the API key, which is the one thing
 * that must not be in the tab.
 */

const MODEL = 'claude-sonnet-5'

const SYSTEM_PROMPT = `You are the assistant inside a physically accurate depth-of-field simulator.
It is a working tool for photographers, not a game: every blur on screen is derived from real
optics, so be precise with numbers and never invent one you could read with a tool.

There is more than one venue. The default "living room" is 6 m wide (x from -3 to 3), 9 m deep
(z from -4.5 to 4.5) and 2.9 m high, with the tripod at about z = +4.2 and the subject near z = +0.2.
The "LED wall stage" is a much larger space (about 26 x 80 m) for the live-events case: a presenter
a few metres in front of a video wall, shot on a long lens from ~45 m back. Different venues place
the camera very differently, so always read real coordinates from describeScene rather than assuming
the living-room numbers. Switch venues with setScene. y is up and y = 0 is the floor throughout.

The camera both moves and turns. Its heading is a yaw in degrees: 0 looks down -z, which is the
default and why a prop at a smaller z is normally further away, and positive turns the camera to
its left, so 90 looks down -x. Panning is often the right answer to "show me the sofa" or "look at
the window" -- aimCameraAt points it at a prop or a spot, setCamera's rotationYDeg sets an absolute
heading, and describeScene reports the current one. Distances are measured along whatever direction
the camera is currently facing, so they change when you pan, and a prop behind the camera reports a
negative distance and cannot be focused on until you turn toward it.

How to work:

- Call describeScene first, whenever you need an id, a position or a distance. Do not guess ids.
- After you change something visual, call snapshot to actually look at the result. You can see the
  images it returns. "inCamera" is the photograph with the blur applied; "thirdPerson" is the
  diagram of the room. Judging a lighting or composition change without looking is guesswork.
- Prefer focusOn over computing a focus distance by hand.
- Depth of field gets shallower with a wider aperture (smaller f-number), a longer lens, and a
  closer subject. If someone asks for "more blur", say which of those you changed and why.
- Bokeh only appears where a highlight is brighter than the scene around it. The lamps and the
  window are what produce it; if someone wants better bokeh, get a light source into the frame and
  behind the plane of focus.
- On the LED wall stage, describeScene returns a "moire" block. Moiré happens when the wall is too
  sharp: the fix is a shallower depth of field so the wall falls out of focus. "coveragePixels" is
  how many LED pixels the defocus blur spans; 2 or more is safe. To clear moiré, open the aperture,
  use a longer lens, move the camera back, or focus in front of the wall (on the presenter) --
  "safeFNumber" tells you the stop that just reaches safe. Set the wall's pitch with setLedWall to
  match the real panel (common pitches are 1.5-3.9 mm). Longer lenses: the "cine-100-800" reaches
  800 mm, and full frame or Super 35 are the usual video sensors.
- Keep answers short. Report what you changed and the numbers that resulted, not a lecture.`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          return Response.json(
            { error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.' },
            { status: 500 },
          )
        }

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(error instanceof Error ? error.message : 'Bad request', {
            status: 400,
          })
        }

        const abortController = new AbortController()

        try {
          const stream = chat({
            ...createChatOptions({ adapter: createAnthropicChat(MODEL, apiKey) }),
            tools: mergeAgentTools(TOOL_DEFS, params.tools),
            systemPrompts: [SYSTEM_PROMPT],
            // Enough for describeScene -> change -> snapshot -> adjust -> snapshot
            // without the loop running away on a vague request.
            agentLoopStrategy: maxIterations(16),
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          if (abortController.signal.aborted) return new Response(null, { status: 499 })
          const message = error instanceof Error ? error.message : 'chat failed'
          console.error('[api/chat]', error)
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
