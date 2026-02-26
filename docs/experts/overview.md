# Experts

## The Problem

When you ask default AI a question, it optimizes for the general population. Ask ChatGPT "how do I prepare for a software engineering interview?" and you get the same generic 5-step list everyone else gets. It's correct but useless - like reading a WikiHow article.

The real value comes from expert-level advice. A seasoned Big Tech hiring manager wouldn't give you a generic list - they'd ask about your experience level, which companies you're targeting, what your weak areas are, and then give you the uncomfortable honest feedback you actually need. But getting that quality from AI requires careful, tailored prompting that most people don't know how to do, don't want to repeat every session, and shouldn't have to think about.

## The Concept

Experts are specialized AI personas available in Novus that carry deep domain knowledge and tailored behavior baked in. Each expert acts like having a knowledgeable person in your network - someone you can just talk to naturally (including by voice) and get real, domain-specific advice without crafting a single prompt.

Think of it like a contacts list. Novus is your default - your personal assistant, the expert on *you*. But when you need specialized help, you open your contacts and reach out to someone who knows that domain deeply.

### What makes this different from just asking ChatGPT?

An expert doesn't just *know* things - it *behaves* like someone with that expertise:

- **A hiring manager** pushes back on weak answers, asks probing follow-ups, and tells you what you don't want to hear
- **A top Chinese chef** asks what's in your pantry, your skill level, and whether you own a wok before recommending a recipe
- **A plumber** asks you to describe the sound, when it started, and what you've already tried before diagnosing

The interactive back-and-forth is what separates this from reading an article. Experts ask questions back.

## How It Works

### Default Experience

The user opens Novus and talks to Novus as usual - their personal assistant, the one who knows their life, context, and history.

### Accessing Experts

From the main interface, the user can open a **contacts list** - a browsable roster of available experts. This functions like a marketplace of people you can talk to.

Selecting an expert opens a dedicated conversation with that persona. Each expert has its own conversation history and context.

### Built-in Experts

Novus ships with a curated set of built-in experts to start. These cover common, high-value domains where generic AI falls especially short. Examples:

- **Tech Interview Coach** - a seasoned FAANG hiring manager who runs mock interviews and gives blunt feedback
- **Home Chef** - a knowledgeable cook who tailors recipes to what you have, your skill level, and your time
- **Fitness Coach** - a trainer who builds programs around your actual schedule, equipment, and goals
- **Financial Advisor** - helps you think through budgeting, investing basics, and financial decisions
- **Writing Editor** - reviews your writing with real editorial standards, not just grammar checks

### User Customization

Users can customize built-in experts to better fit their needs:

- Adjust the expert's focus area (e.g. narrow "Tech Interview Coach" to backend systems design at FAANG)
- Set preferences the expert should always know (e.g. "I'm vegetarian" for the chef, "I have a home gym" for the trainer)

Users can also create entirely new experts from scratch by defining:

- **Name and role** - who this person is
- **Persona** - their background, expertise, tone, and behavior (the "character sheet")
- **Instructions** - how they should approach conversations, what questions they should ask, what they should push back on

### What an Expert Is Made Of (v1)

Under the hood, an expert is a defined persona that shapes the AI's behavior for that conversation. In v1 this consists of:

- **System prompt** - the foundational instructions that set the expert's domain, depth, and constraints
- **Persona definition** - the character: their background, communication style, how they think through problems, what follow-up questions they naturally ask, and what kind of feedback they give

This is intentionally simple. The power comes from well-crafted personas, not complex infrastructure.

## Design Feel

The default aesthetic is **clean, functional, but not sterile** - Perplexity is the closest reference point. Visual hierarchy and information density when you need it, breathing room when you don't. The UI should feel like a serious tool you trust, not a toy and not a terminal.

Since Novus is voice-first, the visual UI primarily exists for review, browsing experts, and reading back conversations. It should stay clean and out of the way - support the content, don't compete with it.

### Per-Expert Shifts

The design system stays consistent, but experts can carry **subtle visual shifts** - accent colors, avatar presence at the top of the chat, slightly different energy. Talking to Novus (your home base) should feel slightly warmer and more familiar. Talking to an expert should feel slightly more focused. Same design language, different tone.

These shifts are small by default (built-in experts have curated accents), but users can customize the look of their own experts and the overall theme.

## Novus's Role

Novus itself is an expert - the expert on *you*. It sits as the default contact, powered by your memory, threads, and personal context.

In the future, Novus could consult other experts on your behalf (e.g. "let me check with the fitness coach on that"), but that's not the focus for v1. For now, each expert is its own standalone conversation.

---

## Roadmap

### v1 - Core Expert System
- Built-in curated experts ship with the app
- Users can customize built-in expert preferences
- Users can create custom experts from scratch
    - ai can help them create their expert
- Each expert has its own dedicated conversation
- Voice-enabled conversations with experts
- Clean, Perplexity-esque default theme with subtle per-expert accent shifts (colors, avatar presence)

### v2 - Knowledge-Enhanced Experts
- Attach knowledge bases and reference documents to experts (e.g. a cookbook PDF to the chef, your company's interview rubric to the interview coach)
- Experts can reference and cite their attached materials during conversations

### v3 - Context Sharing
- User-controlled context sharing between Novus and experts
- Choose whether an expert starts fresh or gets context from Novus ("Novus, tell the interview coach about my background")
- User history and preferences can be selectively shared with specific experts
- Novus can brief an expert before you talk to them

### v4 - Cross-Expert Conversations
- Novus can route questions to or consult other experts mid-conversation
- Experts can be brought into the same conversation for multi-perspective advice

### v5 - Custom Theming
- Users can customize the overall app theme
- Users can define custom visual themes for their own experts
- Community-shared themes in the marketplace

### v6 - Expert Marketplace
- Users can publish their custom experts for others to use
- Browse and install community-created experts
- Rating and review system for community experts
- Creators can iterate on experts based on community feedback

### v7 - Technical Configurations
- default auto mode (we pick the model)
- add thinking/reasoning, and web search
- users can configure the model they want to use

### v8 - Agentic Capabilities