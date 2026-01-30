## Novus Overview

### What Novus is

Novus is an **interactive second brain** — a conversational knowledge companion that lets you capture, organize, and retrieve your thoughts and information through natural dialogue. Instead of sifting through files, notes, or scattered documents, you simply talk to Novus and it:

1. understands your questions and context,
2. retrieves relevant information from your stored knowledge,
3. maintains organized memory across **Threads** (topics, projects, areas of life),
4. helps you think through problems and synthesize insights.

Conversation is the primary interface. The web app serves as a dashboard for browsing your second brain, reviewing history, and managing your knowledge — but the core experience is asking and receiving.

---

## Core product principles

* **Conversational access:** Ask questions naturally; Novus retrieves and synthesizes answers from your second brain.
* **Deep conversations:** Novus helps you think through problems, make connections across topics, and create order from chaos.
* **Thread-native memory:** Threads are living knowledge containers with structured memory, not just chat history.
* **Effortless capture:** Speak your thoughts, and Novus organizes them into the right Thread automatically.
* **Always available context:** No more "where did I put that?" — your knowledge is always a question away.
* **Trust and control:** See what was captured, why it was stored, and easily edit or remove anything.

---

## Core concepts

### Thread  

A Thread is a topic, project, or area of knowledge in your life. Examples: "Business Pivot," "Housr," "Health Research," "Bible Study," "Book Notes," "Personal Journal."

Each Thread maintains:

* **Summary:** current state of knowledge in a few bullets
* **Key insights:** important conclusions and realizations
* **Open questions:** things you're still exploring or need to resolve
* **Connections:** links to related Threads and cross-references
* **Conversation history:** past dialogues + captured knowledge

### Intent routing

Novus automatically determines:

* which Thread the user is asking about or adding to
* whether the user is asking a question, capturing new information, brainstorming, or seeking connections across topics
  If ambiguous, Novus asks: "Which Thread is this for?" and proceeds.

---

## MVP scope (initial)

Must ship:

* Conversational interface (text-based chat with Novus)
* Threads (create/select; organize knowledge by topic)
* Thread page (summary, key insights, open questions, conversation history)
* Knowledge retrieval (ask questions, get answers from your stored information)
* Capture flow (add new information to Threads via conversation)

Explicitly not required for MVP:

* External integrations (Calendar, Tasks, etc.)
* File/document ingestion
* Multi-user collaboration
* Voice input (text-first for MVP, voice can come later)

---

## Success metric

Primary: **Weekly active conversations** (users asking questions and capturing knowledge).
Secondary: Knowledge retrieval success rate (did Novus answer the question from stored info?), and returning weekly users.

---

## Tech stack

* **Frontend:** Next.js (web app, conversational UI)
* **Backend:** FastAPI (auth, conversation orchestration, knowledge retrieval, memory management)
* **DB:** Supabase (Postgres for Threads, conversations, knowledge storage)
* **LLM:** OpenAI or similar (conversation handling, knowledge synthesis, retrieval-augmented generation)
* **Embeddings:** Vector storage for semantic search across your second brain

---

## System responsibilities (high level)

### Frontend (Next.js)

* Conversational chat interface
* Display conversation history and responses
* Thread selection and Thread dashboard (browse your second brain)
* Knowledge capture confirmation
* Settings: default Thread behavior, display preferences

### Backend (FastAPI)

* Auth + session management
* Orchestrate LLM conversations and knowledge retrieval
* Thread memory update pipeline (summary, insights, open questions)
* Semantic search across stored knowledge
* Embedding generation and vector storage management

### Data model (minimum entities)

* users
* threads
* conversations (messages, timestamps)
* knowledge_items (captured information, embeddings)
* thread_summaries
* open_questions
* connections (cross-thread references)

---

## Behavioral rules

* Respond conversationally; feel like talking to a knowledgeable friend who knows your context.
* Ask at most 1 to 2 clarifying questions before producing a response.
* When capturing new knowledge, confirm what was stored and where.
* Make connections between topics when relevant — surface insights across Threads.
* Keep Thread memory editable and attributable to the source conversation.

- track context and intent across interactions
- an orchestration layer for your knowledge
- potential personas and custom settings for the assistant (tone, verbosity, etc.)