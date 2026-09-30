export interface ToolbarButton {
  id: string;
  label: string;
  enabled: boolean;
  active: boolean;
}

export class Toolbar {
  readonly buttons: ToolbarButton[] = [
    { id: "save", label: "Save", enabled: true, active: false },
    { id: "undo", label: "Undo", enabled: true, active: false },
    { id: "redo", label: "Redo", enabled: true, active: false },
    { id: "play", label: "Play", enabled: true, active: false },
    { id: "translate", label: "Move", enabled: true, active: true },
    { id: "rotate", label: "Rotate", enabled: true, active: false },
    { id: "scale", label: "Scale", enabled: true, active: false },
    { id: "grid", label: "Grid", enabled: true, active: true },
  ];

  setEnabled(id: string, enabled: boolean): void {
    const button = this.buttons.find((entry) => entry.id === id);
    if (button) button.enabled = enabled;
  }

  setActive(id: string, active: boolean): void {
    const exclusive = ["translate", "rotate", "scale"];
    const target = this.buttons.find((entry) => entry.id === id);
    if (!target) return;
    if (active && exclusive.includes(id)) {
      for (const button of this.buttons) {
        if (exclusive.includes(button.id)) button.active = button.id === id;
      }
      return;
    }
    target.active = active;
  }

  press(id: string): boolean {
    const button = this.buttons.find((entry) => entry.id === id);
    if (!button || !button.enabled) return false;
    return true;
  }
}

