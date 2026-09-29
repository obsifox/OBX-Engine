# Input API

`@obx/input` — keyboard, mouse, touch, gamepads with virtual controls.

## Devices

`Keyboard` (`isDown`, `wasPressed`, `wasReleased`), `Mouse` (position, buttons, wheel),
`TouchDevice` (pointer states), `Gamepad` (sticks, triggers, buttons).

## Aggregation

`InputManager` snapshots all devices per frame with `update()`; action mapping binds
named actions to key/button combinations.

## DOM and manual

`DomInputAdapter` wires real browser events; every device accepts manual injection for
deterministic tests and servers.
