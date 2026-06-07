# Releasing

Releases are published to npm from GitHub Actions using trusted publishing.

## Publish a Release

Bump `package.json`, commit the change to `main`, and create a GitHub release
with the matching tag:

```sh
gh release create v0.1.2 --target main --notes "Release Notes go here!"
```

The release tag must match `package.json`. For example, `v0.1.2` publishes only
when `package.json` contains `"version": "0.1.2"`.

The release workflow will:

- install dependencies
- run `pnpm run check`
- run `pnpm run build`
- publish with `npm publish --access public`
