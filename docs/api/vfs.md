# VFS API

`@obx/vfs` — virtual file system (v1.1).

## Virtual paths

`normalizeVirtualPath` collapses `.`/`//` and resolves `..` **inside** the virtual root —
escapes throw `VfsError`. `joinVirtualPath`, `parentVirtualPath`.

## Adapters

`VirtualFileSystemAdapter` = `read/write/exists/list/remove/stat`.

- `MemoryFileSystem` — in-memory files + implied directories.
- `PhysicalFileSystem({ root, files })` — maps virtual paths onto a host filesystem
  (typically `platform.files`).
- `PackageFileSystem(entries)` — read-only packaged content (`addEntry`).

## Mounts

`VirtualFileSystem.mount(prefix, adapter)` / `unmount` — longest-prefix routing, merged
directory listings across mounts, `resolve(path)` returns the owning mount + local path.

```ts
const vfs = new VirtualFileSystem();
vfs.mount("/game", new MemoryFileSystem());
vfs.mount("/game/vendor", new PackageFileSystem({ "/core.txt": "x" }));
```
