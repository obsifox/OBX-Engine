export interface ProjectInfo {
  id: string;
  name: string;
  root: string;
  createdAt: number;
  lastOpenedAt: number;
  scenes: string[];
  dirty: boolean;
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

let projectCounter = 0;

export class ProjectManager {
  private readonly projects = new Map<string, ProjectInfo>();
  private readonly recents: string[] = [];
  private currentId: string | null = null;
  private clock = 0;

  get current(): ProjectInfo | null {
    return this.currentId ? this.projects.get(this.currentId)! : null;
  }

  create(name: string, root: string): ProjectInfo {
    if (this.projects.size > 0 && [...this.projects.values()].some((project) => project.root === root)) {
      throw new ProjectError(`project root already open: ${root}`);
    }
    projectCounter += 1;
    const info: ProjectInfo = {
      id: `project_${projectCounter}`,
      name,
      root,
      createdAt: this.tick(),
      lastOpenedAt: 0,
      scenes: [],
      dirty: true,
    };
    this.projects.set(info.id, info);
    this.open(info.id);
    return info;
  }

  open(id: string): ProjectInfo {
    const info = this.projects.get(id);
    if (!info) throw new ProjectError(`unknown project ${id}`);
    this.currentId = id;
    info.lastOpenedAt = this.tick();
    const index = this.recents.indexOf(id);
    if (index >= 0) this.recents.splice(index, 1);
    this.recents.unshift(id);
    return info;
  }

  close(id: string): boolean {
    const removed = this.projects.delete(id);
    if (removed) {
      const index = this.recents.indexOf(id);
      if (index >= 0) this.recents.splice(index, 1);
      if (this.currentId === id) this.currentId = this.recents[0] ?? null;
    }
    return removed;
  }

  recent(limit = 10): ProjectInfo[] {
    return this.recents.slice(0, limit).map((id) => this.projects.get(id)!);
  }

  all(): ProjectInfo[] {
    return [...this.projects.values()];
  }

  addScene(projectId: string, scenePath: string): void {
    const info = this.projects.get(projectId);
    if (!info) throw new ProjectError(`unknown project ${projectId}`);
    if (!info.scenes.includes(scenePath)) info.scenes.push(scenePath);
    info.dirty = true;
  }

  markSaved(projectId: string): void {
    const info = this.projects.get(projectId);
    if (!info) throw new ProjectError(`unknown project ${projectId}`);
    info.dirty = false;
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }
}
