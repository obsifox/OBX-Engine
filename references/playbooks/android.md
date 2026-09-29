# Playbook: Android

## Common Mistakes
- Main thread IO, memory leaks (context), missing permission checks, hardcoded keys, no proguard, not handling config changes, ignoring Doze.

## Security Checklist
- No hardcoded API keys (secret_scan), EncryptedSharedPrefs for sensitive, biometric prompt not bypassable, exported components false unless needed, network security config.

## Performance Checklist
- ViewHolder, DiffUtil, avoid overdraw, WorkManager for background, baseline profiles, APK size check, leakcanary for Tier3.

## Recommended Structure
```
app/
  src/main/java/com/example/
    ui/
    data/
    domain/
  res/
  AndroidManifest.xml
build.gradle.kts
```

## Verification
- `./gradlew assembleDebug` exit 0
- Tests: `./gradlew test` log
- Lint: `./gradlew lint`
- Manual install on emulator if available else NOT TESTED, check no ANR, no secret in APK via secret_scan on built files
