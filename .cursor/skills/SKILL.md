---
name: conductor-react-dev
description: Develops a Vite + React + TypeScript app that uses Tone.js for audio and MediaPipe Hands for hand tracking (conductor-style gestures). Use when editing this stack, hand/audio integration, gesture logic, or when the user mentions conductor, Tone.js, MediaPipe Hands, or this skill name.
---

# Conductor React Dev

## Stack assumptions
- **Build**: Vite, React, TypeScript (strict where the project already uses it).
- **Audio**: Tone.js (scheduling, synths, transport, envelopes—match existing patterns).
- **Vision**: MediaPipe Hands (`@mediapipe/hands` / Tasks Vision as already wired—do not rip out for another SDK unless asked).

## BMAD output rules (always)
- **Concise**: Short, direct. No filler. Do not explain unless the user explicitly asks.
- **Diffs only**: Reply with changed regions only. Use `// ... existing code` (or TS `/* ... */`) for skipped context. Never paste full files unless the user explicitly asks.
- **No terminal**: Do not run shell commands. Do not suggest or list commands unless the user explicitly asks for commands.
- **No auto-install**: Do not propose `npm install` / package adds unless the user asks; assume deps exist.
- **Errors**: When debugging from logs, focus on the error line first unless more context is clearly needed.
- **Language**: English only. Tone: direct, technical.

## Code change rules
- Minimal edits; match project naming, hooks patterns, and file structure.
- Prefer extending existing hooks/components over new parallel abstractions.
- Keep hand landmark math and audio scheduling in sync with how the repo already handles `requestAnimationFrame`, `Tone.getContext()`, and MediaPipe callbacks—avoid duplicate loops unless necessary.

## When unsure
- Infer from existing files; do not re-scaffold Vite/React or reinitialize the project.