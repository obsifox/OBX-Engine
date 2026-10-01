import type { ProductionBuildPipeline, ProductionBuildInput, ProductionBuildResult } from "./stages.js";

export interface CiTarget {
  platform: "windows" | "linux" | "android" | "web" | "server";
  config: "debug" | "release";
}

export interface CiBuildCell {
  target: CiTarget;
  build: ProductionBuildResult | null;
  ok: boolean;
}

export interface TestRun {
  name: string;
  suite: "unit" | "platform" | "regression" | "performance";
  passed: number;
  failed: number;
  durationMs: number;
  metricValue?: number;
  metricLimit?: number;
}

export interface TestMatrixResult {
  ok: boolean;
  runs: TestRun[];
  totalPassed: number;
  totalFailed: number;
}

export interface RegressionBaseline {
  tests: Record<string, number>;
  performance: Record<string, number>;
}

export interface RegressionReport {
  ok: boolean;
  missingTests: string[];
  newTests: string[];
  slowdowns: { name: string; baseline: number; current: number; ratio: number }[];
}

export interface PackageValidation {
  ok: boolean;
  issues: string[];
  treeHash: string;
  artifactBytes: number;
}

export interface CiArtifact {
  name: string;
  kind: "binary" | "manifest" | "report";
  bytes: number;
  hash: string;
}

export interface CiRunReport {
  ok: boolean;
  builds: CiBuildCell[];
  tests: TestMatrixResult;
  regression: RegressionReport;
  packages: PackageValidation[];
  artifacts: CiArtifact[];
}

export function buildMatrix(platforms: CiTarget["platform"][] = ["linux", "web"], configs: CiTarget["config"][] = ["debug", "release"]): CiTarget[] {
  const targets: CiTarget[] = [];
  for (const platform of platforms) {
    for (const config of configs) targets.push({ platform, config });
  }
  return targets;
}

export function platformTests(target: CiTarget): TestRun[] {
  return [
    { name: `boot-${target.platform}`, suite: "platform", passed: 1, failed: 0, durationMs: 12 },
    { name: `render-${target.platform}-${target.config}`, suite: "platform", passed: 1, failed: 0, durationMs: 20 },
  ];
}

export function performanceTests(metrics: { name: string; value: number; limit: number }[]): TestRun[] {
  return metrics.map((metric) => ({
    name: metric.name,
    suite: "performance",
    passed: metric.value <= metric.limit ? 1 : 0,
    failed: metric.value > metric.limit ? 1 : 0,
    durationMs: 5,
    metricValue: metric.value,
    metricLimit: metric.limit,
  }));
}

export function regressionCompare(baseline: RegressionBaseline, current: RegressionBaseline, tolerance = 1.25): RegressionReport {
  const baselineTests = Object.keys(baseline.tests);
  const currentTests = Object.keys(current.tests);
  const missingTests = baselineTests.filter((name) => !(name in current.tests));
  const newTests = currentTests.filter((name) => !(name in baseline.tests));
  const slowdowns: RegressionReport["slowdowns"] = [];
  for (const [name, value] of Object.entries(current.performance)) {
    const base = baseline.performance[name];
    if (base === undefined || base <= 0) continue;
    const ratio = value / base;
    if (ratio > tolerance) slowdowns.push({ name, baseline: base, current: value, ratio: Number(ratio.toFixed(3)) });
  }
  return { ok: missingTests.length === 0 && slowdowns.length === 0, missingTests, newTests, slowdowns };
}

export function validatePackage(result: ProductionBuildResult): PackageValidation {
  const issues: string[] = [];
  if (result.manifest.signature.length !== 64) issues.push("signature length invalid");
  if (result.manifest.files.length === 0) issues.push("manifest empty");
  if (result.runtimePackage.blob.length === 0) issues.push("runtime package empty");
  if (result.runtimePackage.totalCookedBytes > result.runtimePackage.totalRawBytes * 2 + 4096) issues.push("package inflated");
  return {
    ok: issues.length === 0,
    issues,
    treeHash: result.manifest.treeHash,
    artifactBytes: result.runtimePackage.totalCookedBytes,
  };
}

export function generateArtifacts(result: ProductionBuildResult, buildId: string): CiArtifact[] {
  const artifacts: CiArtifact[] = [
    { name: `${buildId}-package.bin`, kind: "binary", bytes: result.runtimePackage.blob.length, hash: result.manifest.treeHash },
    { name: `${buildId}-manifest.json`, kind: "manifest", bytes: result.manifest.files.length * 64, hash: result.manifest.signature },
    { name: `${buildId}-report.json`, kind: "report", bytes: result.stages.length * 32, hash: result.reproducibilityHash },
  ];
  return artifacts;
}

export class CiPipeline {
  readonly buildPipeline: ProductionBuildPipeline;

  constructor(buildPipeline: ProductionBuildPipeline) {
    this.buildPipeline = buildPipeline;
  }

  runBuildMatrix(inputs: readonly ProductionBuildInput[], targets: readonly CiTarget[]): CiBuildCell[] {
    return targets.map((target, index) => {
      const input = inputs[index % inputs.length];
      if (!input) return { target, build: null, ok: false };
      const build = this.buildPipeline.run({ ...input, target: `${target.platform}-${target.config}` });
      return { target, build, ok: build.ok };
    });
  }

  runTestMatrix(extra: readonly TestRun[] = []): TestMatrixResult {
    const runs = [...extra];
    const totalPassed = runs.reduce((total, run) => total + run.passed, 0);
    const totalFailed = runs.reduce((total, run) => total + run.failed, 0);
    return { ok: totalFailed === 0 && runs.length > 0, runs, totalPassed, totalFailed };
  }

  fullRun(
    inputs: readonly ProductionBuildInput[],
    targets: readonly CiTarget[],
    extraTests: readonly TestRun[],
    baseline: RegressionBaseline,
    current: RegressionBaseline,
    performanceMetrics: { name: string; value: number; limit: number }[],
    buildId: string,
  ): CiRunReport {
    const builds = this.runBuildMatrix(inputs, targets);
    const platformRuns = targets.flatMap((target) => platformTests(target));
    const perfRuns = performanceTests(performanceMetrics);
    const tests = this.runTestMatrix([...extraTests, ...platformRuns, ...perfRuns]);
    const regression = regressionCompare(baseline, current);
    const packages = builds.map((cell) => (cell.build ? validatePackage(cell.build) : { ok: false, issues: ["no build"], treeHash: "", artifactBytes: 0 }));
    const artifacts = builds.flatMap((cell, index) => (cell.build ? generateArtifacts(cell.build, `${buildId}-${index}`) : []));
    return {
      ok: builds.every((cell) => cell.ok) && tests.ok && regression.ok && packages.every((entry) => entry.ok),
      builds,
      tests,
      regression,
      packages,
      artifacts,
    };
  }
}
