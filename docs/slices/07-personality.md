# Slice 07 — Investor personality

## Goal

Five-question self-assessment, one-time reveal screen, persisted profile; briefing nav gated until complete.

## Depends on

Slice 01.

## Domain rules

- Questions, scoring, label mapping [domain.md](../domain.md)
- Tables `personality_answers`, `investor_profiles`, `settings.personality_revealed_at`

## In scope

### Domain (tests)

- `scorePersonality(answers)` → label + four dimension scores
- Label mapping edge cases (capital_preserver liquidity high)

### UI states

- `/personality`: quiz if not all answers OR user retaking
- On submit: save answers + profile, set `personality_revealed_at`, show **reveal** view
- After reveal: profile summary + retake (confirm)
- Sidebar: Briefing disabled until profile exists

### Storage

- Answers upserted per question key
- Retake clears answers and profile then restarts quiz

## Files allowed

```
src/domain/personality.ts, personality.test.ts
src/db/repositories/personality.ts
src/app/personality/page.tsx
src/components/personality-quiz.tsx, reveal.tsx
src/app/briefing/page.tsx (gate only stub OK)
```

## Out of scope

- AI briefing content
- Sharing profile

## Acceptance checks

- [x] All 5 questions required before submit
- [x] Reveal shows title matching label table
- [x] Reload after quiz shows profile not quiz (unless retake)
- [x] Unit tests for each label boundary
