import { describe, expect, it } from "vitest";
import { CLI_VERSION, createCliHost, parseArgs, runCli } from "../src/index.js";

function setupProject(): ReturnType<typeof createCliHost> {
  const host = createCliHost();
  runCli(["create", "MyGame"], host);
  return host;
}

describe("parseArgs", () => {
  it("parses commands, positionals and flags", () => {
    expect(parseArgs(["build", "web", "--target=fast", "--verbose", "-q", "extra"])).toEqual({
      command: "build",
      positionals: ["web", "extra"],
      flags: { target: "fast", verbose: true, q: true },
    });
    expect(parseArgs(["export", "--target", "linux"])).toEqual({
      command: "export",
      positionals: [],
      flags: { target: "linux" },
    });
    expect(parseArgs([]).command).toBe("");
  });
});

describe("help and version", () => {
  it("prints help and version", () => {
    const help = runCli(["help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("obsifox <command> [options]");
    expect(help.out).toContain("export <target>      export a package (windows|linux|android|web|server)");
    const version = runCli(["--version"]);
    expect(version.out).toEqual([`obsifox ${CLI_VERSION}`]);
    const viaFlag = runCli(["build", "--help"]);
    expect(viaFlag.code).toBe(0);
  });
});

describe("create and doctor", () => {
  it("generates a project and reports diagnostics", () => {
    const host = createCliHost();
    const created = runCli(["create", "MyGame"], host);
    expect(created.code).toBe(0);
    expect(created.out).toContain("created project MyGame");
    expect(created.out).toContain("folders: 11");
    expect(host.files.has("projects/MyGame/project.json")).toBe(true);
    expect(host.files.has("projects/MyGame/assets/.keep")).toBe(true);
    const doctor = runCli(["doctor"], host);
    expect(doctor.code).toBe(0);
    expect(doctor.out).toContain("project: MyGame 0.1.0");
    expect(doctor.out).toContain("diagnostics ok");
    const missing = runCli(["doctor"]);
    expect(missing.code).toBe(1);
    const noName = runCli(["create"]);
    expect(noName.code).toBe(2);
    expect(() => runCli(["create", "1bad"], createCliHost())).not.toThrow();
  });
});

describe("build and export", () => {
  it("builds and exports packages", () => {
    const host = setupProject();
    host.files.set("projects/MyGame/src/main.js", 'import "src/util.js";\nconst main = 1;');
    host.files.set("projects/MyGame/src/util.js", "const util = 2;");
    host.files.set("projects/MyGame/assets/level.txt", "aaaaabbbbbccccc");
    const built = runCli(["build", "web"], host);
    expect(built.code).toBe(0);
    expect(built.out[0]).toBe("built MyGame 0.1.0 for web");
    expect(built.out[1]).toContain("analyze(2)");
    const exported = runCli(["export", "windows"], host);
    expect(exported.code).toBe(0);
    expect(host.files.has("dist/windows/manifest.json")).toBe(true);
    expect(host.files.has("dist/windows/package.json")).toBe(true);
    expect(host.files.has("dist/windows/bin/game.exe")).toBe(false);
    expect(JSON.parse(host.files.get("dist/windows/package.json")!).target).toBe("windows");
    const bad = runCli(["export"], host);
    expect(bad.code).toBe(2);
    const noProject = runCli(["build"]);
    expect(noProject.code).toBe(1);
  });
});

describe("config, assets, plugins", () => {
  it("manages settings and inventory", () => {
    const host = setupProject();
    host.files.set("projects/MyGame/assets/hero.txt", "hero-data");
    const list = runCli(["config", "list"], host);
    expect(list.code).toBe(0);
    expect(list.out).toContain("language=en");
    expect(runCli(["config", "get", "language"], host).out).toEqual(["en"]);
    const set = runCli(["config", "set", "difficulty", "hard"], host);
    expect(set.code).toBe(0);
    expect(runCli(["config", "get", "difficulty"], host).out).toEqual(["hard"]);
    expect(runCli(["config", "get"], host).code).toBe(2);
    const assets = runCli(["assets", "list"], host);
    expect(assets.out).toContain("projects/MyGame/assets/hero.txt");
    expect(runCli(["assets", "check"], host).out).toContain("assets: 1 indexed");
    expect(runCli(["plugin", "list"], host).code).toBe(0);
    expect(runCli(["plugin", "check"], host).out).toContain("plugins: 0 valid");
    expect(runCli(["package"], host).out[0]).toContain('"name":"MyGame"');
  });
});

describe("utility commands", () => {
  it("runs test, clean, run, dev and editor", () => {
    const host = setupProject();
    host.files.set("projects/MyGame/tests/core.test.js", "assert(true);");
    expect(runCli(["test"], host).out).toEqual(["1 test files, 0 failed"]);
    expect(runCli(["run"], host).out).toEqual(["running MyGame (headless)"]);
    expect(runCli(["dev"], host).out[0]).toContain("dev server listening");
    expect(runCli(["editor"], host).out[0]).toContain("ObsiFox Studio");
    host.files.set("dist/web/bundle.js", "x");
    expect(runCli(["clean"], host).out).toEqual(["cleaned 1 files"]);
    expect(host.files.has("dist/web/bundle.js")).toBe(false);
  });

  it("rejects unknown commands", () => {
    const result = runCli(["frobnicate"]);
    expect(result.code).toBe(2);
    expect(result.out[0]).toBe("unknown command: frobnicate");
  });
});
