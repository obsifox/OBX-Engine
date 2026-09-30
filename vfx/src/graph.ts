export type VfxNodeType = "emitter" | "force" | "color" | "size" | "spawn" | "output" | "texture" | "math";

export interface VfxNode {
  id: string;
  type: VfxNodeType;
  params: Record<string, number | string | boolean>;
}

export interface VfxLink {
  from: string;
  to: string;
}

export class VfxGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VfxGraphError";
  }
}

export class VfxNodeGraph {
  readonly nodes = new Map<string, VfxNode>();
  readonly links: VfxLink[] = [];

  addNode(node: VfxNode): this {
    if (this.nodes.has(node.id)) throw new VfxGraphError(`duplicate node ${node.id}`);
    this.nodes.set(node.id, node);
    return this;
  }

  link(from: string, to: string): this {
    if (!this.nodes.has(from) || !this.nodes.has(to)) throw new VfxGraphError(`unknown node in link ${from} -> ${to}`);
    this.links.push({ from, to });
    return this;
  }

  validate(): string[] {
    const errors: string[] = [];
    const outgoing = new Map<string, string[]>();
    for (const link of this.links) {
      outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link.to]);
    }
    const state = new Map<string, number>();
    const visit = (id: string): void => {
      const current = state.get(id) ?? 0;
      if (current === 1) {
        errors.push(`cycle at ${id}`);
        return;
      }
      if (current === 2) return;
      state.set(id, 1);
      for (const next of outgoing.get(id) ?? []) visit(next);
      state.set(id, 2);
    };
    for (const id of this.nodes.keys()) visit(id);
    for (const node of this.nodes.values()) {
      if (node.type === "output") continue;
      if (!(outgoing.get(node.id)?.length)) errors.push(`dangling node ${node.id}`);
    }
    return errors;
  }

  compileOrder(): string[] {
    const errors = this.validate();
    if (errors.some((error) => error.startsWith("cycle"))) {
      throw new VfxGraphError(errors.join(", "));
    }
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    for (const id of this.nodes.keys()) incoming.set(id, 0);
    for (const link of this.links) {
      outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link.to]);
      incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
    }
    const ready = [...this.nodes.keys()].filter((id) => (incoming.get(id) ?? 0) === 0);
    const order: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      for (const next of outgoing.get(id) ?? []) {
        const remaining = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, remaining);
        if (remaining === 0) ready.push(next);
      }
    }
    return order;
  }
}

export interface MaterialGraphNode {
  id: string;
  op: string;
  params: Record<string, number>;
}

export class MaterialGraph {
  readonly nodes = new Map<string, MaterialGraphNode>();

  add(node: MaterialGraphNode): this {
    this.nodes.set(node.id, node);
    return this;
  }

  sample(u: number, v: number): number {
    let result = 0;
    for (const node of this.nodes.values()) {
      switch (node.op) {
        case "uv":
          result = u * (node.params.scale ?? 1) + (node.params.offset ?? 0);
          break;
        case "noise":
          result = Math.sin((u + ((node.params.seed as number | undefined) ?? 0)) * 12.9898 + v * 78.233) * 43758.5453;
          result = result - Math.floor(result);
          break;
        case "mix":
          result = result * (node.params.a ?? 0) + (node.params.b ?? 0) * (1 - (node.params.a ?? 0));
          break;
        case "mul":
          result *= node.params.value ?? 1;
          break;
        default:
          break;
      }
    }
    return result;
  }
}
