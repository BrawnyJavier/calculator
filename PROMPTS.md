# Prompts

The assignment allows AI tooling and asks for the prompts used. This project was built with Claude Code
(Claude Opus) as a pair programmer. Below are my prompts in order, edited for clarity. Where a short prompt
referred to something already agreed, such as "start phase 2" meaning the phase document, that context is
written out. Routine housekeeping prompts, such as commit requests, are left out. Each prompt has a short note
on what came back and what I accepted, changed or rejected.

How I worked: the assistant proposed and implemented, while I set the scope, reviewed each step, ran the app,
and decided what to accept. Each phase ended with tests passing and a commit.

## 1. Planning

> We need to complete a senior software engineering assessment: a full-stack calculator with a React and
> TypeScript frontend and a Go backend microservice, exposing a REST API for addition, subtraction,
> multiplication and division, with optional exponentiation, square root and percentage. It needs input
> validation and error handling, unit tests for both layers, and a README with setup instructions, API
> examples and design rationale. The suggested effort is 2–4 hours.
>
> Act as a senior software engineer and help me produce a clean, maintainable, well-tested implementation.
>
> Constraints:
> - Do not overengineer the solution; avoid unnecessary patterns, abstractions and dependencies.
> - Prefer idiomatic Go and modern React/TypeScript practices.
> - Prioritise correctness, simplicity and maintainability.
> - No databases, authentication, message queues or infrastructure we don't need.
> - Make reasonable engineering decisions independently and explain them.
>
> First, inspect the repository and the available development tools without modifying anything. Then propose
> the project structure, the backend architecture, the REST API contract with request and response examples,
> the frontend architecture, the testing strategy, any dependencies and why, and an implementation plan that
> fits the time budget.

The assistant checked the machine (Go and Docker were missing) and proposed:
- a Go service using only the standard library, with a single `POST /api/v1/calculate` endpoint
- separate error statuses for malformed requests (400) and impossible maths (422)
- a React form for the UI

I accepted the architecture but not the delivery format. One large plan is hard to review and hard to execute
in steps:

> This is too large to review as a single plan. Create a `docs/` folder and split it into phases, one Markdown
> file per phase: backend first, then frontend, then delivery. You decide where the phase boundaries go. Write
> only the phase documents for now; no code yet.

Result: [`docs/`](docs/README.md), seven phase documents, each with scope, steps, tests and a definition of
done. From here on, each phase document was the specification for its phase.

## 2. Backend (phases 1–3)

> Make the initial commit with the plan, then implement Phase 1
> ([domain](docs/backend/phase-1-domain.md)) as specified. Stop at its definition of done.

The domain package, with table-driven tests (100% coverage).

> Implement Phase 2 ([HTTP API](docs/backend/phase-2-http-api.md)) as specified.

> Implement Phase 3 ([server](docs/backend/phase-3-server.md)) as specified.

The HTTP handler, with strict decoding and error mapping, then the server entry point: timeouts, graceful
shutdown and optional static file serving. I accepted them as proposed.

While reviewing I noticed that the Go module path pointed at the wrong GitHub account:

> The module path is wrong: the repository is `github.com/BrawnyJavier/calculator`. Fix the module path and
> every import, and rewrite the existing commits so that no commit references the old path.

## 3. Frontend (phases 4–6)

> Implement Phase 4 ([scaffold](docs/frontend/phase-4-scaffold.md)), then Phase 5
> ([logic and API client](docs/frontend/phase-5-logic-and-client.md)), then Phase 6
> ([UI](docs/frontend/phase-6-ui.md)), each as specified.

This produced the Vite + React + TypeScript scaffold with Vitest, the typed API client with validation, and
the form-based UI from the plan.

> Before moving on, let's review the UI. It works, but it doesn't look or feel like a calculator. Redesign it
> as a modern calculator, with subtle animations.

I rejected the form UI from the original plan. The redesign is a keypad driven by a pure, unit-tested
reducer, and the backend still does every calculation.

> On mobile the calculator should fill the screen, with no background card around it.

> What about tablets? Check that size as well.

> The layout must be fully responsive: it should scale smoothly while the browser window is dragged, with no
> jumps at breakpoints, so it can be demonstrated live by resizing the window.

> Make it full screen on tablets too.

After several layout iterations, the app is full screen on phones and tablets. On larger screens it is a card
that scales smoothly with the window, with no overflow and no animations replaying at breakpoints.

## 4. Review and hardening

> Review the implementation against the requirements as if you were assessing a candidate for a senior
> developer position. Cover both the frontend and the backend, and judge them against current best practices
> for React and Go.

The review judged the code to be at a senior level. It noted that some deliverables were missing (README,
coverage report, prompts, Dockerfile) and listed specific findings in both layers.

> Fix the code findings first. The documentation comes after, so it describes the final behaviour.

Fixed:
- JSON responses for 404 and 405
- 415 for bodies that aren't JSON
- `0 ^ -1` reported as division by zero
- no directory listings from the static file server
- tests for the server entry point (0% → 75.5%)
- results that silently lost integer digits when rounded
- a 15-digit limit on entries
- a keyboard listener that was re-subscribed on every render (now `useEffectEvent`)
- stricter validation of API responses

> Implement Phase 7 ([packaging and docs](docs/delivery/phase-7-packaging-and-docs.md)) as specified.

This phase added the Makefile, Dockerfile, CI, this file and the README, and updated the phase documents to
match what was built.
