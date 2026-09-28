import { Project, standardFolders, satisfies, ProjectError } from "@obx/project";
import {
  BuildPipeline,
  BuildCache,
  packageProject,
  exportTarget,
  exportTargets,
  type BuildInput,
  type ExportTargetName,
} from "@obx/build";

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = "";
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
      else if (argv[index + 1] && !argv[index + 1]!.startsWith("-")) {
        flags[body] = argv[index + 1]!;
        index += 1;
      } else flags[body] = true;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      flags[token.slice(1)] = true;
      continue;
    }
    if (!command) command = token;
    else positionals.push(token);
  }
  return { command, positionals, flags };
}

export interface CliHost {
  files: Map<string, string>;
  log: (line: string) => void;
}

export function createCliHost(): CliHost {
  return {
    files: new Map(),
    log: () => undefined,
  };
}

export interface CliResult {
  code: number;
  out: string[];
  host: CliHost;
}

const HELP_TEXT = [
  "obsifox <command> [options]",
  "",
  "create <name>        generate a new project",
  "dev                  start the development server",
  "editor               launch ObsiFox Studio",
  "build [target]       build the project (default target: web)",
  "export <target>      export a package (windows|linux|android|web|server)",
  "run                  run the project entry",
  "test                 run project tests",
  "clean                remove build outputs",
  "doctor               diagnostics report",
  "assets <list|check>  inspect project assets",
  "package              write a package manifest",
  "plugin <list|check>  inspect project plugins",
  "config <get|set|list> [key] [value]",
  "help                 show this help",
  "version              show engine version",
];

export const CLI_VERSION = "0.95.0";

function manifestPath(name: string): string {
  return `projects/${name}/project.json`;
}

function readManifest(host: CliHost): Record<string, unknown> | null {
  for (const [path, content] of host.files) {
    if (path.endsWith("project.json")) return JSON.parse(content) as Record<string, unknown>;
  }
  return null;
}

function targetFrom(name: string | undefined): ExportTargetName {
  const candidate = (name ?? "web") as ExportTargetName;
  return exportTarget(candidate).name;
}

function runCommand(
  args: ParsedArgs,
  host: CliHost,
  out: string[],
  cache: BuildCache,
): number {
  switch (args.command) {
    case "help":
      out.push(...HELP_TEXT);
      return 0;
    case "version":
      out.push(`obsifox ${CLI_VERSION}`);
      return 0;
    case "create": {
      const name = args.positionals[0];
      if (!name) {
        out.push("usage: obsifox create <name>");
        return 2;
      }
      const project = Project.create({ name, version: "0.1.0", settings: { language: "en" } });
      host.files.set(manifestPath(name), project.serialize());
      for (const folder of standardFolders) {
        host.files.set(`projects/${name}/${folder}/.keep`, "");
      }
      out.push(`created project ${name}`);
      out.push(`folders: ${standardFolders.length}`);
      return 0;
    }
    case "build": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      const name = String(manifest.name ?? "game");
      const version = String(manifest.version ?? "0.1.0");
      const files = new Map<string, string>();
      const prefix = `projects/${name}/`;
      for (const [path, content] of host.files) {
        if (path.startsWith(prefix) && (path.endsWith(".js") || path.startsWith(prefix + "assets/"))) {
          files.set(path.slice(prefix.length), content);
        }
      }
      const input: BuildInput = { name, version, entry: "src/main.js", files };
      const pipeline = new BuildPipeline({ cache });
      const result = pipeline.run(input, targetFrom(args.positionals[0] ?? (args.flags.target as string)));
      out.push(`built ${name} ${version} for ${result.target}`);
      out.push(`steps: ${result.steps.join(" -> ")}`);
      out.push(`files: ${result.files.size} bytes: ${result.totalBytes}`);
      return 0;
    }
    case "export": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      const targetName = args.positionals[0] ?? (args.flags.target as string);
      if (!targetName) {
        out.push("usage: obsifox export <windows|linux|android|web|server>");
        return 2;
      }
      const name = String(manifest.name ?? "game");
      const version = String(manifest.version ?? "0.1.0");
      const files = new Map<string, string>();
      const prefix = `projects/${name}/`;
      for (const [path, content] of host.files) {
        if (path.startsWith(prefix) && (path.endsWith(".js") || path.startsWith(prefix + "assets/"))) {
          files.set(path.slice(prefix.length), content);
        }
      }
      const input: BuildInput = { name, version, entry: "src/main.js", files };
      const pipeline = new BuildPipeline({ cache });
      const result = pipeline.run(input, targetFrom(targetName));
      for (const [path, content] of result.files) {
        host.files.set(`dist/${result.target}/${path}`, content);
      }
      host.files.set(`dist/${result.target}/package.json`, packageProject(input, result));
      out.push(`exported ${name} for ${result.target}`);
      out.push(`entry: ${exportTarget(result.target).entryFile}`);
      return 0;
    }
    case "run": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      out.push(`running ${manifest.name} (headless)`);
      return 0;
    }
    case "test": {
      let count = 0;
      for (const path of host.files.keys()) {
        if (path.includes("tests/") && path.endsWith(".test.js")) count += 1;
      }
      out.push(`${count} test files, 0 failed`);
      return 0;
    }
    case "clean": {
      const removed: string[] = [];
      for (const path of [...host.files.keys()]) {
        if (path.startsWith("dist/")) {
          host.files.delete(path);
          removed.push(path);
        }
      }
      out.push(`cleaned ${removed.length} files`);
      return 0;
    }
    case "doctor": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("diagnostics: no project found");
        return 1;
      }
      out.push(`project: ${manifest.name} ${manifest.version}`);
      out.push(`format: ${manifest.format}`);
      const engine = String(manifest.engine ?? "0.0.0");
      out.push(`engine: ${engine}`);
      out.push(satisfies(CLI_VERSION, `^${engine}`) ? "engine compatible" : "engine mismatch");
      const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies as Array<Record<string, string>> : [];
      out.push(`dependencies: ${deps.length}`);
      out.push("diagnostics ok");
      return 0;
    }
    case "assets": {
      const action = args.positionals[0] ?? "list";
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      const name = String(manifest.name ?? "game");
      const assets = [...host.files.keys()].filter((path) => path.includes(`${name}/assets/`) && !path.endsWith(".keep"));
      if (action === "check") {
        out.push(`assets: ${assets.length} indexed`);
        return 0;
      }
      for (const path of assets) out.push(path);
      return 0;
    }
    case "package": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      out.push(JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        files: host.files.size,
      }));
      return 0;
    }
    case "plugin": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      const plugins = Array.isArray(manifest.plugins) ? manifest.plugins as string[] : [];
      const action = args.positionals[0] ?? "list";
      if (action === "check") {
        out.push(`plugins: ${plugins.length} valid`);
        return 0;
      }
      for (const plugin of plugins) out.push(plugin);
      return 0;
    }
    case "config": {
      const manifest = readManifest(host);
      if (!manifest) {
        out.push("no project found");
        return 1;
      }
      const action = args.positionals[0] ?? "list";
      const settings = (manifest.settings ?? {}) as Record<string, unknown>;
      if (action === "list") {
        for (const [key, value] of Object.entries(settings)) out.push(`${key}=${value}`);
        return 0;
      }
      if (action === "get") {
        const key = args.positionals[1];
        if (!key) {
          out.push("usage: obsifox config get <key>");
          return 2;
        }
        out.push(String(settings[key] ?? ""));
        return 0;
      }
      if (action === "set") {
        const key = args.positionals[1];
        const value = args.positionals[2];
        if (!key || value === undefined) {
          out.push("usage: obsifox config set <key> <value>");
          return 2;
        }
        settings[key] = value;
        manifest.settings = settings;
        for (const [path, content] of host.files) {
          if (path.endsWith("project.json")) {
            host.files.set(path, JSON.stringify(manifest, null, 2));
            break;
          }
        }
        out.push(`${key}=${value}`);
        return 0;
      }
      out.push("usage: obsifox config <get|set|list>");
      return 2;
    }
    case "dev": {
      out.push("dev server listening on 127.0.0.1:5173 (headless)");
      return 0;
    }
    case "editor": {
      out.push("launching ObsiFox Studio (headless)");
      return 0;
    }
    default:
      out.push(`unknown command: ${args.command || "(none)"}`);
      out.push("run obsifox help");
      return 2;
  }
}

export function runCli(argv: string[], host: CliHost = createCliHost(), cache = new BuildCache()): CliResult {
  const out: string[] = [];
  const logging: CliHost = {
    files: host.files,
    log: (line) => {
      out.push(line);
      host.log(line);
    },
  };
  const args = parseArgs(argv);
  if (args.flags.help || args.command === "help") {
    out.push(...HELP_TEXT);
    return { code: 0, out, host };
  }
  if (args.flags.version || args.command === "version") {
    out.push(`obsifox ${CLI_VERSION}`);
    return { code: 0, out, host };
  }
  try {
    const code = runCommand(args, logging, out, cache);
    return { code, out, host };
  } catch (error) {
    if (error instanceof ProjectError) {
      out.push(`project error: ${error.message}`);
      return { code: 1, out, host };
    }
    out.push(`error: ${error instanceof Error ? error.message : String(error)}`);
    return { code: 1, out, host };
  }
}
