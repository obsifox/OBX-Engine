# Lens: Performance

## When to Load
Tier 2+ if user mentions performance, or handling large data, loops, DB queries, rendering, API latency. Tier 3 always.

## Checklist
- [ ] Measured vs Estimated distinguished (see evidence-rules)
- [ ] CPU / Memory / I/O / Network / DB considered where relevant
- [ ] No N+1 queries
- [ ] No unbounded loops / memory growth
- [ ] Caching justified and scoped securely
- [ ] Asset sizes checked for frontend
- [ ] Benchmark run if feasible, else explicit NOT TESTED

## Expected Output
- `.eng/artifacts/perf-review.md`:
  - What was measured (command, data size)
  - Results: latency, memory, etc or "NOT TESTED - no harness"
  - Structured findings: `- [F-001] severity=HIGH status=OPEN | N+1 query in ... | src/api.ts:45`
  - Verdict

## Tools
- Manual code analysis
- Project benchmarks if exist
- `time`, `du`, DB explain if applicable

## Gate Condition
No open CRITICAL perf regression (structured severity=CRITICAL|HIGH status=OPEN). If measurement impossible, mark NOT TESTED and log risk.

## Distinguish
- Measured Problem: benchmark shows X ms > threshold
- Estimated Risk: code pattern suggests risk
- Optimization Opportunity: non-blocking improvement -> BACKLOG
