# Playbook: Minecraft Paper Plugin

## Common Mistakes
- Blocking main thread (DB, IO, heavy loops), no async, missing plugin.yml, NPE on config, no version check, leaking EventHandlers.

## Security Checklist
- No arbitrary command execution from config, validate player input, no file path traversal in data folder, no secrets in jar.

## Performance Checklist
- Async for DB/IO, avoid sync chunk loading, cache lookups, limit scheduler tasks, profile with spark if Tier3.

## Recommended Structure
```
src/main/java/com/example/
  Plugin.java
  listeners/
  commands/
  managers/
resources/
  plugin.yml
  config.yml
```

## Verification
- `./gradlew build` or `mvn package` exit 0
- Test on Paper server (if available else NOT TESTED), check startup log no errors, commands work, no main thread warnings
- Check plugin.yml valid, permissions defined
