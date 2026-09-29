# Networking API

`@obx/networking` — transports, reliability, RPC, replication and prediction.

## Transports

`MemoryNetwork.createPair(options)` produces linked `MemoryTransport` endpoints with
latency/jitter/drop; `protocolProfiles` describes tcp/udp/websocket/webrtc traits;
`createTransport(kind, network, options)` tunes a link per profile.

## Reliability and RPC

`ReliableChannel` (acks, retransmit, ordered reassembly), `RpcSystem`
(register/call/poll with timeouts).

## Replication

`ReplicationSystem`/`ReplicationClient` sync entity snapshots; `GameServer` applies
inputs authoritatively and broadcasts interest-filtered snapshots to `GameClient`.
`PredictionSystem`, `InterpolationSystem`, `LagCompensation`, `InterestManagement`
cover the sync pipeline.

See also `@obx/server` (headless runtime, dedicated server) and `@obx/multiplayer`
(lobby, rooms, matchmaking, anti-cheat).
