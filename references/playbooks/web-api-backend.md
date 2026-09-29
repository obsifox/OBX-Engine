# Playbook: Web API Backend

## Common Mistakes
- No input validation, SQL injection via ORM misuse, missing authz on endpoints, logging PII, N+1 queries, no rate limiting, returning stack traces.

## Security Checklist
- Auth: JWT expiry, refresh rotation, password hashing (bcrypt/argon2)
- Authz: check ownership on every resource access
- Validation: zod / joi / pydantic, reject unknown fields
- SQL: parameterized queries, ORM safe usage
- Secrets: .env not committed, secret_scan.sh
- Headers: CORS scoped, Helmet, no sensitive headers
- Rate limit + pagination limits

## Performance Checklist
- DB indexing, explain query for critical paths
- N+1 detection, connection pooling
- Cache with TTL and invalidation, scoped
- Payload size, compression

## Recommended Structure
```
src/
  api/ routes/
  services/
  models/
  middleware/
  config/
tests/
.env.example
```

## Verification
- `npm run build` / `go build` etc exit 0
- Tests: unit + integration, `npm test` log
- Manual: curl endpoints with valid/invalid auth, check 401/403
- secret_scan + dep_audit
- Load test if Tier3: k6 or autocannon log, else NOT TESTED
