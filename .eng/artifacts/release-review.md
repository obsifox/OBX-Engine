# Release Review — v1.7.0 (2026-10-01)
- artifact: v170-release-review
- sha256: 7006e1fee3496735
- demo: examples/v170-demo/output/frame.png (1280x560, 2x2 SS, 27s)
- suite: 861/861 (80 files) | gates: all | demo: 17 scenarios clean

## v1.6.0 release review
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS G3_Security PASS G4_Release PASS G5_Project PASS; suite 798/798; demo stats.json errors=0
- artifact: docs/screenshots/v160-update.svg
- sha256:44539afa38713f079a3820814a82af53ff7ab0e07eda81a9ac1bc04d070c2b5e

# Release review — v1.5.0

- artifact: docs/screenshots/v150-update.svg
- sha256:80ffbe597a5b88ef546211cf755945d365dd38f8f4bbb37884d66dbdc058405f
- demo: examples/v150-demo/output/frame.png (engine-rendered 640x360)
- release sheet: docs/releases/v1.5.md (report_lint PASS)
- suite: 756/756 (baseline 701 + 55 new)
- gates: G0 PASS · G1 PASS · G2 PASS · G4 PASS
