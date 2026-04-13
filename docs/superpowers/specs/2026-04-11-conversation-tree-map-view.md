# Conversation Tree Map View

Date: 2026-04-11
Status: Future design note
Related design: [Conversation Tree Design](./2026-04-11-conversation-tree-design.md)

## Purpose

This document describes a future optional map view for dense conversation trees. It is intentionally out of scope for the first implementation.

The primary chat experience remains transcript-first. The map exists only as an auxiliary navigation surface when a conversation becomes too large for chips and the lightweight branch navigator to remain sufficient.

## Role In The Product

The future map view is:

- navigation-only
- optional
- secondary to the transcript

The future map view is not:

- the default conversation surface
- a side-by-side comparison workspace
- a replacement for transcript-native branch chips

## Core Behavior

- The user opens the map explicitly from the conversation UI.
- The map shows the shape of the current conversation tree.
- Branch points are represented by assistant replies that have multiple child continuations.
- Child branches are labeled by their branch titles.
- The currently active path is visually highlighted.
- Clicking a branch or node switches the main transcript to that path.
- The map does not open multiple branches at once.
- The map does not turn the conversation into a canvas-first experience.

## Design Principles

- Keep the transcript as the primary reading and writing surface.
- Optimize the map for orientation and jumping, not for detailed reading.
- Avoid exposing implementation language such as raw node IDs.
- Use short assistant-reply previews and branch titles as the visible labels.
- Preserve continuity with the transcript-native model so the same branch structure is recognizable in both surfaces.

## Recommended UI Shape

A likely future implementation would be a dedicated overlay or modal rather than a persistent pane.

That keeps the map:

- available when needed
- easy to dismiss
- clearly secondary to the main chat flow

The visual should resemble a structured tree or outline map, but it should avoid becoming an Obsidian-style infinite canvas. The point is quick orientation, not freeform spatial organization.

## Relationship To V1

V1 already establishes the underlying branch model:

- assistant-reply branch points
- branch chips in the transcript
- branch titles
- a branch-selection map
- a message tree built from `previous_message_id`

Because of that, the future map view should be a new projection of the same underlying structure, not a separate data model.

## Open Questions For Later

- whether the map should open as a modal, large overlay, or dedicated full-screen mode
- how much branch preview text is useful before the map becomes visually noisy
- whether the lightweight top-right branch navigator should be the entry point into the map
- what threshold of tree density should trigger suggesting the map to the user
