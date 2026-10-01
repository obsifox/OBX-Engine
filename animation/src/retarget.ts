import { Quat, Vec3 } from "@obx/math";
import type { BoneDefinition, BonePose, Pose, Skeleton } from "./animation.js";

export interface RetargetMap {
  boneMap: Map<string, string>;
  scale: number;
}

export function buildRetargetMap(source: Skeleton, target: Skeleton, nameMap: Record<string, string> = {}, scale = 1): RetargetMap {
  const boneMap = new Map<string, string>();
  const targetNames = new Set(target.bones.map((bone) => bone.name));
  for (const bone of source.bones) {
    const mapped = nameMap[bone.name] ?? bone.name;
    if (targetNames.has(mapped)) boneMap.set(bone.name, mapped);
  }
  return { boneMap, scale };
}

export function retargetPose(sourcePose: Pose, map: RetargetMap, source: Skeleton, target: Skeleton): Pose {
  const result: Pose = target.restPose();
  for (const [sourceName, targetName] of map.boneMap) {
    const sourceRotation = sourcePose.get(`${sourceName}.rotation`) as Quat | undefined;
    const sourcePosition = sourcePose.get(`${sourceName}.position`) as Vec3 | undefined;
    const sourceBone = source.bones.find((bone) => bone.name === sourceName)!;
    const targetBone = target.bones.find((bone) => bone.name === targetName)!;
    if (sourceRotation) {
      const restDelta = sourceBone.rotation.clone().invert().multiply(sourceRotation);
      const retargeted = targetBone.rotation.clone().multiply(restDelta).normalize();
      result.set(`${targetName}.rotation`, retargeted);
    }
    if (sourcePosition) {
      const restOffset = sourcePosition.clone().sub(sourceBone.position).scale(map.scale);
      result.set(`${targetName}.position`, targetBone.position.clone().add(restOffset));
    }
  }
  return result;
}

export function scaleSkeleton(skeleton: Skeleton, scale: number, rootPosition = new Vec3(0, 0, 0)): BoneDefinition[] {
  return skeleton.bones.map((bone) => ({
    name: bone.name,
    parent: bone.parent,
    position: bone.name === skeleton.order[0] ? rootPosition.clone() : bone.position.clone().scale(scale),
    rotation: bone.rotation.clone(),
  }));
}

export function retargetWorldPose(world: Map<string, BonePose>, map: RetargetMap): Map<string, BonePose> {
  const result = new Map<string, BonePose>();
  for (const [sourceName, targetName] of map.boneMap) {
    const pose = world.get(sourceName);
    if (!pose) continue;
    result.set(targetName, {
      position: pose.position.clone().scale(map.scale),
      rotation: pose.rotation.clone(),
    });
  }
  return result;
}
