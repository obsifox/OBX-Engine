# Audio API

`@obx/audio` — clips, envelopes, mixing and spatial playback.

## Clips and voices

`AudioClip` holds sample data; `AudioVoice` plays a clip with gain/pan/pitch.
`Envelope` shapes attack/decay/sustain/release.

## Mixer

`AudioMixer` with named buses routed to a master bus; per-bus gain and mute.

## Spatial audio

`Audio2D` places sources in 2D with distance attenuation; `Audio3D` uses listener
position/orientation with inverse-distance falloff.

## Effects

`EchoProcessor` (feedback delay) and `ReverbProcessor` (comb + allpass) post-mix.
