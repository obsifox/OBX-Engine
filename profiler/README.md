# @obx/profiler

Profiling toolkit for OBX Engine — CPU spans, memory peaks, per-channel metric
trackers, frame debugger with draw-call statistics and combined JSON reports.

```ts
import { CpuProfiler, MemoryProfiler, ChannelTracker, FrameDebugger, ProfileReport } from "@obx/profiler";

const cpu = new CpuProfiler();
cpu.begin("update");
cpu.end("update");
const frames = new FrameDebugger();
frames.beginFrame(1);
frames.drawCall(12, 4000);
frames.endFrame();
```

See `docs/releases/v0.96.md` for the full API tour. License: MIT.
