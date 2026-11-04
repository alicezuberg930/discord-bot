import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin UI (web/, built by Vite) lives in dist/web next to main.js and is
 * served under /export-excel/.
 */
export const WEB_DIST_DIR = join(import.meta.dirname, '..', 'web');

const NOT_BUILT_PAGE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Quản lý thành viên</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p>Giao diện quản trị chưa được build. Hãy chạy <code>npm run build</code>.</p>
</body></html>`;

let cachedPage: string | undefined;

export function readAdminPage(): string {
  if (cachedPage === undefined) {
    try {
      cachedPage = readFileSync(join(WEB_DIST_DIR, 'index.html'), 'utf8');
    } catch {
      return NOT_BUILT_PAGE;
    }
  }

  return cachedPage;
}
