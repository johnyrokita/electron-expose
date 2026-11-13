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

## If the Publish Job Fails

Nothing is published until the last step, so a failed run leaves npm unchanged.

Re-running the job does not pick up a fix. A release run uses the workflow file
and the code from the commit the tag points at. Fix the problem on `main`, then
delete the release with its tag and create it again:

```sh
gh release delete v0.1.2 --cleanup-tag --yes
gh release create v0.1.2 --target main --notes "Release Notes go here!"
```
