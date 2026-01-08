---
description: How to release a new version
---

1. Bump version in `package.json`
   ```bash
   npm version patch --no-git-tag-version
   ```
2. Bump version in `src/manifest.json` to match `package.json`.

3. Create a new commit for the release
   ```bash
   jj new -m "chore: bump version to vX.Y.Z"
   ```

4. Tag the commit (using git as jj does not support tag creation yet)
   ```bash
   jj tag set vX.Y.Z -r <revision>
   ```

5. Set the main bookmark
   ```bash
   jj bookmark set main -r <revision>
   ```

6. Push changes
   ```bash
   jj git push
   ```
