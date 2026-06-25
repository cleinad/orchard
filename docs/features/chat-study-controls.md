# Chat Study Controls

## Purpose

The chat composer should let a user tune how the assistant teaches in the current session. The main problems are mismatched assumed knowledge and mismatched response depth: sometimes the assistant over-explains familiar material, and sometimes it skips foundations the user needs.

## Option 1: Two-Axis Response Style Control

Add a compact `Response style` control near the model picker in `ChatComposer.tsx`. Opening it shows a composer popover with two snapping controls:

- **Length**: how complete and expansive the answer should be.
- **Level**: how much prior knowledge the assistant should assume.

The controls should persist for the current chat session and reset to defaults for new sessions. The closed trigger can summarize active settings, such as `Deep · Familiar`, while default settings can simply show `Response style`.

Current labels:

- **Length**: `Concise`, `Brief`, `Detailed`, `Deep`
- **Level**: `New`, `Familiar`, `Advanced`, `Fluent`

This option is currently preferred because it directly maps to the two recurring frustrations without forcing users into broad presets.

## Option 2: Study Mode Presets

Offer a small list of study-oriented modes that bundle depth, level, and response shape:

- **Quick answer**: concise and direct.
- **Teach me**: explanatory, patient, and example-driven.
- **Deep study**: thorough, structured, and comprehensive.
- **Technical**: denser, more precise, and less introductory.
- **Quiz me**: prompts recall and checks understanding.

This could be faster for casual use and easier to scan, but it is less precise when the user wants an unusual combination, such as a brief answer at a high knowledge level or a deep answer for a new topic.

## Tradeoffs

The two-axis control is more flexible and better for session-level tuning, but requires careful labels and a clean popover so it does not feel like configuration work. Presets are simpler to choose from, but they hide the underlying controls and may not solve the mismatch problem as consistently.
