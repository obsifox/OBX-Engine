import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import { Body, PhysicsWorld, planeShape, sphereShape } from "@obx/physics";
import {
  Engine,
  Transmission,
  VehicleAI,
  createCar,
  vehicleInput,
  type EngineConfig,
} from "../src/index.js";

const engineConfig: EngineConfig = {
  idleRpm: 900,
  maxRpm: 7000,
  torqueCurve: [
    { rpm: 900, torque: 100 },
    { rpm: 3000, torque: 260 },
    { rpm: 6000, torque: 180 },
  ],
  gearRatios: [3, 2, 1],
  finalDrive: 3,
  reverseRatio: -2.8,
  brakeTorque: 4000,
  engineBraking: 200,
  upshiftRpm: 5600,
  downshiftRpm: 2000,
};

function makeWorld(): PhysicsWorld {
  const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
  world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0), friction: 0.9 }));
  return world;
}

describe("Engine", () => {
  it("samples the torque curve", () => {
    const engine = new Engine(engineConfig);
    expect(engine.torque(900)).toBe(100);
    expect(engine.torque(1950)).toBeCloseTo(180, 9);
    expect(engine.torque(4500)).toBeCloseTo(220, 9);
    expect(engine.torque(7000)).toBe(180);
    engine.update(9000);
    expect(engine.rpm).toBe(7000);
    engine.update(10);
    expect(engine.rpm).toBe(900);
  });
});

describe("Transmission", () => {
  it("shifts up and down within bands", () => {
    const transmission = new Transmission(engineConfig);
    expect(transmission.gear).toBe(1);
    transmission.update(5700, vehicleInput({ throttle: 1 }));
    expect(transmission.gear).toBe(2);
    transmission.update(7000, vehicleInput({ throttle: 1 }));
    expect(transmission.gear).toBe(2);
    transmission.update(1900, vehicleInput());
    expect(transmission.gear).toBe(1);
    transmission.update(1500, vehicleInput({ reverse: true }));
    expect(transmission.gear).toBe(-1);
    expect(transmission.ratio()).toBe(-2.8);
    transmission.update(2600, vehicleInput());
    expect(transmission.gear).toBe(0);
  });
});

describe("Vehicle", () => {
  it("rests on its suspension at ride height", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.4, 0), engine: engineConfig });
    for (let i = 0; i < 120; i += 1) {
      car.update(1 / 60, vehicleInput(), world);
      world.step(1 / 60);
    }
    expect(car.wheels.every((wheel) => wheel.contact !== null)).toBe(true);
    const compressionSum = car.wheels.reduce((sum, wheel) => sum + wheel.compression, 0);
    expect(compressionSum).toBeGreaterThan(0.05);
    expect(car.body.position.y).toBeGreaterThan(0.4);
    expect(car.body.position.y).toBeLessThan(1.5);
  });

  it("drives forward under throttle and stops with brakes", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.4, 0), engine: engineConfig });
    for (let i = 0; i < 60; i += 1) {
      car.update(1 / 60, vehicleInput(), world);
      world.step(1 / 60);
    }
    for (let i = 0; i < 120; i += 1) {
      car.update(1 / 60, vehicleInput({ throttle: 1 }), world);
      world.step(1 / 60);
    }
    expect(car.forwardSpeed).toBeGreaterThan(2);
    expect(car.engine.rpm).toBeGreaterThan(engineConfig.idleRpm);
    for (let i = 0; i < 120; i += 1) {
      car.update(1 / 60, vehicleInput({ brake: 1 }), world);
      world.step(1 / 60);
    }
    expect(Math.abs(car.forwardSpeed)).toBeLessThan(1.2);
  });

  it("steers toward the input direction", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.4, 0), engine: engineConfig });
    for (let i = 0; i < 90; i += 1) {
      car.update(1 / 60, vehicleInput({ throttle: 0.7, steer: 1 }), world);
      world.step(1 / 60);
    }
    expect(car.wheels[0]!.steerAngle).toBeGreaterThan(0.3);
    const forward = car.body.rotation.rotateVec3(new Vec3(0, 0, 1));
    expect(forward.x).toBeGreaterThan(0.25);
    const xAfterRight = car.body.position.x;
    expect(xAfterRight).toBeGreaterThan(0.35);
  });

  it("takes impact damage above the threshold", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.4, 0), engine: engineConfig });
    car.noteImpact(100);
    expect(car.integrity).toBe(1);
    car.noteImpact(2600);
    expect(car.integrity).toBeLessThan(1);
    expect(car.impactEnergy).toBeGreaterThan(2000);
  });
});

describe("VehicleAI", () => {
  it("follows waypoints and requests steering", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.4, 0), engine: engineConfig });
    const ai = new VehicleAI(car, [
      { position: new Vec3(8, 0, 0), targetSpeed: 6 },
      { position: new Vec3(8, 0, 8), targetSpeed: 5 },
      { position: new Vec3(0, 0, 8), targetSpeed: 5 },
      { position: new Vec3(0, 0, 0), targetSpeed: 6 },
    ]);
    const steers: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const input = ai.step();
      steers.push(input.steer);
      car.update(1 / 60, input, world);
      world.step(1 / 60);
    }
    expect(ai.index).toBeGreaterThan(0);
    expect(steers.some((value) => Math.abs(value) > 0.05)).toBe(true);
  });
});

describe("suspension geometry", () => {
  it("compresses more under load and tracks the ground", () => {
    const world = makeWorld();
    const car = createCar(world, { position: new Vec3(0, 1.2, 0), engine: engineConfig, mass: 2400 });
    for (let i = 0; i < 180; i += 1) {
      car.update(1 / 60, vehicleInput(), world);
      world.step(1 / 60);
    }
    const heavy = car.wheels.reduce((sum, wheel) => sum + wheel.compression, 0);
    expect(heavy).toBeGreaterThan(0.1);
    expect(car.body.position.y).toBeGreaterThan(0.3);
  });

  it("detects air when the ground disappears", () => {
    const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
    const car = createCar(world, { position: new Vec3(0, 2, 0), engine: engineConfig });
    world.addBody(new Body({ type: "static", shape: sphereShape(0.2), position: new Vec3(0, -40, 0) }));
    for (let i = 0; i < 40; i += 1) {
      car.update(1 / 60, vehicleInput(), world);
      world.step(1 / 60);
    }
    expect(car.wheels.every((wheel) => wheel.contact === null)).toBe(true);
  });
});
