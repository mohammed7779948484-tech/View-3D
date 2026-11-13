# Upgrading Pascal's packages

How to move `@pascal-app/core`, `viewer`, `editor` and `nodes` to a new version
(`decisions/0008-pascal-editor-foundation.md`). Do it on its own branch, as its own pull request,
never together with other work.

## 1. Read what changed

- Read the "Breaking" section of every release between the current and the new version in the
  CHANGELOG of `pascalorg/editor` (and its GitHub releases). Note anything about: `<Editor>`
  props, `configureViewer`, asset paths (`/icons`, `/material`, `/audios`), decoders, WebGPU or
  WebGL, `next/image`, the scene format (`SceneGraph`), and new remote URLs.
- Check the new version's age on npm (`pnpm view @pascal-app/editor time --json`). A release
  from the same day can still be pulled or patched; when there is no urgency, wait a few days.

## 2. Raise all four packages together, to one exact version

```bash
pnpm add -D --save-exact @pascal-app/core@X.Y.Z @pascal-app/viewer@X.Y.Z @pascal-app/editor@X.Y.Z @pascal-app/nodes@X.Y.Z
```

- One command for all four: two separate `pnpm add` runs gave two copies of each package once,
  and two copies of `core` mean two node registries. Check that `node_modules/.pnpm` holds
  exactly one folder per `@pascal-app/*` package and one `@iconify+react`.
- Check that `next` is still not installed (`node_modules/next` must not exist). If the editor
  adds new `next/*` imports, add a shim and an alias in `electron.vite.config.ts`.
- Update the versions and dates in `docs/STACK.md`.

## 3. Bring the assets up to date

- **Icons and sounds** (`app/renderer/public/icons`, `audios`, `cursor.svg`): copy them again
  from `apps/editor/public` of `pascalorg/editor` at the tag or commit of the new version. Keep
  only files from that repository (MIT, `LICENSE-pascal.txt`); record the commit in `STACK.md`.
- **Hard-coded asset paths**: search the packages for `'/icons/`, `'/material/`, `'/audios/` and
  `'/cursor.svg'` and check that every referenced icon, sound and the cursor exists in
  `app/renderer/public`.
- **Iconify icons** (`app/renderer/pascal/icon-names.json`): search the packages for
  `'set:name'` literals (`lucide:`, `mdi:`, `ph:`, `carbon:`, `qlementine-icons:` and any new
  set) and update the list. The build fails on a name that is not in the `@iconify-json` package.
  A new icon set needs its `@iconify-json/*` package (with a `STACK.md` entry).
- **Remote URLs**: search the packages for `https://` and check that each one the page can reach
  is either replaced in `configureViewer` / `useGLTF.setDecoderPath`, or refused and harmless.
- **Textures** stay out until their licence is verified and they can be decoded without
  `unsafe-eval` (decision 0008).

## 4. Clear the caches

Delete `node_modules/.vite` and `out/` (and any `.next` folder) before building again.

## 5. Check everything

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm package:dir
```

- `app/renderer/pascal/pascal-editor.d.ts` declares the editor's types for `tsc`; compare it
  with the new `EditorProps` and `SceneGraph` and update it.
- `test/app/renderer/pascal/webgpu-gate.test.ts` reads Pascal's renderer start-up code: if it
  fails, Pascal now asks for more than our WebGPU gate checks; change the gate to match.
- `test/e2e/pascal.spec.ts` must pass with the packaged app too
  (`VIEW3D_EXE=release/win-unpacked/View-3D.exe`): no remote request, no CSP refusal, no error in
  the page or its workers.
- Open the app, press "Pascal editor (preview)", and look: the L-shaped test shop in 3D and 2D.
