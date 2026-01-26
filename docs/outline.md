## Novus Overview

### What Novus is

Novus is a **voice-first executive assistant** that reduces the number of apps you use by letting you speak naturally and having the system:

1. understand intent,
2. route it to the right **Thread** and tool,
3. maintain durable memory per Thread,
4. propose and commit concrete next actions into your existing systems.

Voice is the primary UI. The web app exists mainly as a control panel and audit trail, not as the main place you “work.”

---

## Core product principles

* **Voice-first, minimal UI:** user speaks; Novus asks clarifying questions only when needed.
* **Deep Conversations** Novus is able to converse with the user and help them think through problems, convert into actionable steps and create order from chaos.
* **Fewer apps:** Novus writes actions into existing tools (Calendar, Tasks) so the user does not manage yet another task system.
* **Thread-native memory:** Threads are living workstreams with structured memory, not just chat history.
* **Loop closing:** Most sessions should end with 1 to 3 proposed actions, with explicit user approval to commit.
* **Trust and control:** show what was captured, why it was captured, and allow edits/undo.

---

## Core concepts

### Thread

A Thread is an ongoing workstream in a user’s life (project, role, goal, job). Examples: “Business Pivot” “Housr,” “Recruiting,” “Health,” “Bible study.”

Each Thread maintains:

* **Brief:** current status in a few bullets
* **Decisions:** timestamped
* **Open loops:** pending questions or follow-ups
* **Next actions:** proposed and committed actions
* **Session history:** transcripts + structured outputs

### Intent routing

Novus automatically determines:

* which Thread the user is talking about
* whether the user is brainstorming, capturing notes, creating commitments, scheduling, or asking questions
  If ambiguous, Novus asks: “Which Thread is this for?” and proceeds.

---

## MVP scope (initial)

Must ship:

* Voice chat (capture, transcription, assistant responses)
* Threads (create/select; attach each session to one Thread)
* Thread page (brief, open loops, proposed actions, history)
* Google Tasks and Google Calendar integrations (via MCP or equivalent connector)
* Commit gating (assistant proposes actions; user taps “Commit” to write to external tools)

Explicitly not required for MVP:

* Email sending
* “Bring any page to life” content ingestion
* Multi-user collaboration
* Fully autonomous actions without confirmation

---

## Success metric

Primary: **Weekly committed actions created from voice** (tasks/events written via Novus).
Secondary: returning weekly voice sessions per user, and open loops closed within 7 days.

---

## Tech stack

* **Frontend:** Next.js (web app, ideally PWA-friendly for mobile voice use)
* **Backend:** FastAPI (auth, session orchestration, tool calls, memory management)
* **DB:** Supabase (Postgres for Threads, sessions, actions, sync state)
* **Voice agent:** LiveKit (real-time voice pipeline, agent connection, streaming audio)
* **Integrations:** MCP-based connectors for Google Calendar and Google Tasks (start with minimal actions: create task, create calendar event)

---

## System responsibilities (high level)

### Frontend (Next.js)

* Voice capture UI (tap-to-talk / hold-to-talk)
* Display transcript and assistant output
* Thread selection and lightweight Thread dashboard
* Commit UI for proposed actions
* Settings: default Thread behavior, integration status, safety toggles

### Backend (FastAPI)

* Auth + session management
* Orchestrate STT, LLM reasoning, and tool execution
* Thread memory update pipeline (brief, decisions, open loops, actions)
* Tool routing (Google Tasks/Calendar) with commit gating
* Sync state tracking + retries for external tool writes

### Data model (minimum entities)

* users
* threads
* voice_sessions (audio refs, transcript, timestamps)
* thread_brief_items
* open_loops
* proposed_actions
* committed_actions (external ids, status)
* integration_tokens / connection metadata

---

## Behavioral rules

* Default to voice interaction; typed input is fallback.
* Ask at most 1 to 2 clarifying questions before producing output.
* Every session produces a structured update plus next actions or explicitly states none.
* Never silently create external tasks/events; require user confirmation.
* Keep Thread memory editable and attributable to the source session.

- track context and intent across interactions
- an orchestration layer essentially
- potential personas and custom setting for the agent