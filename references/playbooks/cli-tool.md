# Playbook: CLI Tool

## Common Mistakes
- No --help, no error codes, writes to stdout instead of stderr for errors, no config file handling, no signal handling, assumes cwd.

## Security Checklist
- Validate file paths (no traversal if user-supplied), no shell injection via exec, permissions on config files (600), no secrets in args logged.

## Performance Checklist
- Streaming for large files, not loading entire file in memory, lazy imports.

## Recommended Structure
```
src/
  cli.ts / main.py / main.go
  commands/
  lib/
bin/
tests/
README.md (usage examples)
```

## Verification
- Build exit 0
- `--help` works, exit codes: 0 success, 1 error, 2 usage
- Test with invalid args, missing files, permission errors
- secret_scan.sh
- Try install locally if applicable
