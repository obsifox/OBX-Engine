import type { AnimationClip, UvRect } from "./spritesheet.js";
import { fullUv } from "./spritesheet.js";

export class SpriteAnimator {
  time = 0;
  playing = false;
  finished = false;
  frameIndex = 0;

  constructor(public clip: AnimationClip | null = null) {}

  play(clip: AnimationClip | null = this.clip): void {
    if (clip !== this.clip) {
      this.clip = clip;
      this.time = 0;
      this.frameIndex = 0;
    }
    this.playing = true;
    this.finished = false;
  }

  pause(): void {
    this.playing = false;
  }

  resume(): void {
    if (!this.finished) this.playing = true;
  }

  stop(): void {
    this.playing = false;
    this.finished = false;
    this.time = 0;
    this.frameIndex = 0;
  }

  update(deltaSeconds: number): void {
    const clip = this.clip;
    if (!clip || !this.playing || clip.frames.length === 0 || clip.fps <= 0) return;
    this.time += deltaSeconds;
    const total = clip.frames.length;
    let frame = Math.floor(this.time * clip.fps);
    if (frame >= total) {
      if (clip.loop) {
        frame %= total;
      } else {
        frame = total - 1;
        this.playing = false;
        this.finished = true;
      }
    }
    this.frameIndex = frame;
  }

  currentUv(): UvRect {
    return this.clip?.frames[this.frameIndex] ?? fullUv();
  }
}
