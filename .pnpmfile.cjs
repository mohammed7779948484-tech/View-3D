// @pascal-app/editor lists `next` as a peer, but it only uses `next/image` and three image-config
// internals, which our build replaces with small shims (decisions/0008, electron.vite.config.ts).
// pnpm installs missing peers by default, so without this hook it would pull all of Next.js.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@pascal-app/editor' && pkg.peerDependencies) delete pkg.peerDependencies.next;
      return pkg;
    },
  },
};
