import { Color, Mat4 } from "@obx/math";
import type { Mesh } from "../mesh.js";
import type { Render3DBackend, RasterVertex, ShadingContext } from "./software3d.js";

export interface RecordedDraw3D {
  mesh: string;
  material: string;
  matrix: Mat4;
  triangles: number;
}

export class Recording3DBackend implements Render3DBackend {
  readonly name = "recording3d";
  readonly draws: RecordedDraw3D[] = [];
  clears = 0;
  triangles = 0;

  constructor(
    readonly width = 1280,
    readonly height = 720,
  ) {}

  clear(_color: Color): void {
    this.clears += 1;
  }

  drawTriangle(_a: RasterVertex, _b: RasterVertex, _c: RasterVertex, _context: ShadingContext): void {
    this.triangles += 1;
    const last = this.draws[this.draws.length - 1];
    if (last) {
      last.triangles += 1;
    }
  }

  recordMesh(mesh: Mesh, materialName: string, matrix: Mat4): void {
    this.draws.push({ mesh: mesh.name, material: materialName, matrix, triangles: 0 });
  }

  get drawCount(): number {
    return this.draws.length;
  }
}
