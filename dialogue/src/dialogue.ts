export type DialogueValue = string | number | boolean;

export class DialogueVariables {
  private readonly values = new Map<string, DialogueValue>();

  set(name: string, value: DialogueValue): DialogueValue {
    this.values.set(name, value);
    return value;
  }

  get<T extends DialogueValue>(name: string, fallback: T): T {
    return (this.values.get(name) as T | undefined) ?? fallback;
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  delete(name: string): boolean {
    return this.values.delete(name);
  }

  toObject(): Record<string, DialogueValue> {
    return Object.fromEntries(this.values);
  }

  load(data: Record<string, DialogueValue>): void {
    this.values.clear();
    for (const [key, value] of Object.entries(data)) this.values.set(key, value);
  }
}

export type DialogueCondition = (variables: DialogueVariables) => boolean;
export type DialogueEffect = (variables: DialogueVariables) => void;

export interface ChoiceDefinition {
  id: string;
  text: string;
  condition?: DialogueCondition;
  effects?: DialogueEffect[];
  next?: string | null;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  voice?: string;
  next?: string | null;
  choices?: ChoiceDefinition[];
  effects?: DialogueEffect[];
}

export class DialogueGraph {
  private readonly nodes = new Map<string, DialogueNode>();

  constructor(nodes: readonly DialogueNode[]) {
    for (const node of nodes) {
      if (this.nodes.has(node.id)) throw new RangeError(`duplicate dialogue node ${node.id}`);
      this.nodes.set(node.id, node);
    }
  }

  node(id: string): DialogueNode | undefined {
    return this.nodes.get(id);
  }

  get size(): number {
    return this.nodes.size;
  }

  get ids(): string[] {
    return [...this.nodes.keys()];
  }

  validate(): string[] {
    const issues: string[] = [];
    for (const node of this.nodes.values()) {
      const targets = [node.next ?? null, ...(node.choices ?? []).map((choice) => choice.next ?? null)];
      for (const target of targets) {
        if (target && !this.nodes.has(target)) issues.push(`${node.id} -> ${target}`);
      }
    }
    return issues;
  }
}

export type TextResolver = (key: string, locale: string) => string;

export interface LocaleTable {
  [locale: string]: Record<string, string>;
}

export class LocalizedText {
  constructor(
    readonly table: LocaleTable,
    readonly fallbackLocale = "en",
  ) {}

  resolve(key: string, locale: string): string {
    return this.table[locale]?.[key] ?? this.table[this.fallbackLocale]?.[key] ?? key;
  }
}

export interface DialogueRunnerOptions {
  locale?: string;
  text?: TextResolver;
  variables?: DialogueVariables;
  onSpeak?: (node: DialogueNode) => void;
}

export class DialogueRunner {
  readonly variables: DialogueVariables;
  readonly history: Array<{ speaker: string; text: string }> = [];
  private currentId: string | null = null;

  constructor(
    readonly graph: DialogueGraph,
    readonly options: DialogueRunnerOptions = {},
  ) {
    this.variables = options.variables ?? new DialogueVariables();
  }

  get current(): DialogueNode | null {
    return this.currentId ? this.graph.node(this.currentId) ?? null : null;
  }

  get finished(): boolean {
    return this.currentId === null;
  }

  start(id: string): DialogueNode {
    const node = this.graph.node(id);
    if (!node) throw new RangeError(`unknown dialogue node ${id}`);
    this.currentId = id;
    this.enter(node);
    return node;
  }

  advance(): DialogueNode | null {
    const node = this.current;
    if (!node || node.choices?.length) return this.current;
    const target = node.next ?? null;
    this.currentId = target;
    if (!target) return null;
    const next = this.graph.node(target);
    if (!next) throw new RangeError(`unknown dialogue node ${target}`);
    this.enter(next);
    return next;
  }

  choose(choiceId: string): DialogueNode | null {
    const node = this.current;
    if (!node) return null;
    const choice = (node.choices ?? []).find((entry) => entry.id === choiceId);
    if (!choice || (choice.condition && !choice.condition(this.variables))) return null;
    for (const effect of choice.effects ?? []) effect(this.variables);
    const target = choice.next ?? null;
    this.currentId = target;
    if (!target) return null;
    const next = this.graph.node(target);
    if (!next) throw new RangeError(`unknown dialogue node ${target}`);
    this.enter(next);
    return next;
  }

  availableChoices(): ChoiceDefinition[] {
    const node = this.current;
    if (!node) return [];
    return (node.choices ?? []).filter((choice) => !choice.condition || choice.condition(this.variables));
  }

  text(locale = this.options.locale ?? "en"): string {
    const node = this.current;
    if (!node) return "";
    return (this.options.text ?? ((key: string) => key))(node.text, locale);
  }

  voice(): string | null {
    return this.current?.voice ?? null;
  }

  private enter(node: DialogueNode): void {
    for (const effect of node.effects ?? []) effect(this.variables);
    this.history.push({ speaker: node.speaker, text: node.text });
    this.options.onSpeak?.(node);
  }
}
