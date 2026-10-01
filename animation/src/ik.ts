import { Quat, Vec3 } from "@obx/math";

export interface FABRIKChain {
  positions: Vec3[];
  lengths: number[];
}

export function chainLengths(positions: readonly Vec3[]): number[] {
  const lengths: number[] = [];
  for (let i = 1; i < positions.length; i += 1) lengths.push(positions[i - 1]!.distanceTo(positions[i]!));
  return lengths;
}

export function fabrikSolve(chain: FABRIKChain, target: Vec3, iterations = 12, tolerance = 1e-3): Vec3[] {
  const positions = chain.positions.map((point) => point.clone());
  const lengths = chain.lengths;
  if (positions.length < 2) return positions;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const root = positions[0]!.clone();
  if (root.distanceTo(target) > total) {
    const direction = target.clone().sub(root).normalize();
    for (let i = 1; i < positions.length; i += 1) {
      positions[i] = root.clone().add(direction.clone().scale(lengths.slice(0, i).reduce((sum, length) => sum + length, 0)));
    }
    return positions;
  }
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    positions[positions.length - 1] = target.clone();
    for (let i = positions.length - 2; i >= 0; i -= 1) {
      const direction = positions[i]!.clone().sub(positions[i + 1]!).normalize();
      positions[i] = positions[i + 1]!.clone().add(direction.scale(lengths[i]!));
    }
    positions[0] = root.clone();
    for (let i = 1; i < positions.length; i += 1) {
      const direction = positions[i]!.clone().sub(positions[i - 1]!).normalize();
      positions[i] = positions[i - 1]!.clone().add(direction.scale(lengths[i - 1]!));
    }
    if (positions[positions.length - 1]!.distanceTo(target) <= tolerance) break;
  }
  return positions;
}

export interface CcdJoint {
  rotation: Quat;
  position: Vec3;
}

export function rotationBetween(from: Vec3, to: Vec3): Quat {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  const dot = a.dot(b);
  if (dot >= 1 - 1e-6) return Quat.identity();
  if (dot <= -1 + 1e-6) {
    const axis = Math.abs(a.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    return Quat.fromAxisAngle(axis.cross(a).normalize(), Math.PI);
  }
  const axis = a.clone().cross(b).normalize();
  return Quat.fromAxisAngle(axis, Math.acos(Math.min(1, Math.max(-1, dot))));
}

export function ccdSolve(joints: CcdJoint[], target: Vec3, iterations = 10, tolerance = 1e-3): CcdJoint[] {
  const result = joints.map((joint) => ({ rotation: joint.rotation.clone(), position: joint.position.clone() }));
  if (result.length < 2) return result;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let i = result.length - 2; i >= 0; i -= 1) {
      const pivot = result[i]!;
      const end = result[result.length - 1]!;
      const toEnd = end.position.clone().sub(pivot.position);
      const toTarget = target.clone().sub(pivot.position);
      if (toEnd.lengthSq() < 1e-12 || toTarget.lengthSq() < 1e-12) continue;
      const delta = rotationBetween(toEnd, toTarget);
      for (let k = i + 1; k < result.length; k += 1) {
        const offset = result[k]!.position.clone().sub(pivot.position);
        result[k]!.position = pivot.position.clone().add(delta.clone().rotateVec3(offset));
      }
      for (let k = i; k < result.length; k += 1) {
        result[k]!.rotation = delta.clone().multiply(result[k]!.rotation).normalize();
      }
    }
    if (result[result.length - 1]!.position.distanceTo(target) <= tolerance) break;
  }
  return result;
}

export interface LookAtResult {
  rotation: Quat;
  reached: boolean;
}

export function lookAtRotation(forward: Vec3, targetDirection: Vec3): LookAtResult {
  const from = forward.clone().normalize();
  const to = targetDirection.clone().normalize();
  const dot = from.dot(to);
  return { rotation: rotationBetween(from, to), reached: dot > 1 - 1e-3 };
}

export function applyFkRotations(chain: CcdJoint[], rotations: Quat[]): CcdJoint[] {
  const result: CcdJoint[] = [];
  let position = chain[0]!.position.clone();
  for (let i = 0; i < chain.length; i += 1) {
    const rotation = rotations[i] ?? chain[i]!.rotation;
    if (i > 0) {
      const offset = chain[i]!.position.clone().sub(chain[i - 1]!.position);
      position = position.clone().add(rotation.clone().rotateVec3(offset));
    }
    result.push({ rotation: rotation.clone(), position: position.clone() });
  }
  return result;
}
