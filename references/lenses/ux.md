# Lens: UX / UI

## When to Load
Any frontend, mobile, game UI, CLI UX, WordPress frontend, dashboard.

## Checklist
- [ ] Information architecture clear
- [ ] User flows (happy, error, empty, loading)
- [ ] Responsive / mobile behavior
- [ ] Accessibility (keyboard, ARIA, contrast) - at least checked
- [ ] Error states with actionable messages
- [ ] Empty states
- [ ] Loading states
- [ ] Consistency with existing UI
- [ ] No destructive action without confirmation

## Expected Output
- `.eng/artifacts/ux-review.md`:
  - Screens/flows checked
  - Structured findings: `- [F-001] severity=MED status=OPEN | Missing loading state on ...`
  - Screenshots list if applicable
  - Verdict

## Tools
- Manual review
- Accessibility checklist

## Gate Condition
No open HIGH UX issue that breaks core flow (severity=HIGH status=OPEN). MED/LOW -> BACKLOG allowed.
