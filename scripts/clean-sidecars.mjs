// External macOS volumes may create AppleDouble metadata beside generated JS.
// Those metadata files must never be treated as Worker modules or migrations.
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.startsWith('._')) await unlink(path);
    else if (entry.isDirectory()) await clean(path);
  }
}
for (const directory of process.argv.slice(2)) await clean(directory);
