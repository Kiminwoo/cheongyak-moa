import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '@cheongyak-moa/contracts';
import { projectRoot, dataPaths } from '../paths.js';
import { BoardClient, BOARD_SITES } from '../core/board-http.js';
import { boardListURL, parseBoardList } from '../core/board-parser.js';
import { collectBoards } from '../core/board-collectors.js';
import { Store } from '../core/store.js';
const paths = dataPaths(projectRoot(import.meta.url));
if (!process.argv.includes('--probe')) {
  const store = new Store(paths.database);
  try {
    for (const result of await collectBoards(store, { rawDir: paths.raw })) {
      console.log(
        `${result.source}: ${result.status} · ${result.count}건 · ${result.code ?? ''} · ${result.message}`,
      );
      if (result.status === 'failed') process.exitCode = 1;
    }
  } finally {
    store.close();
  }
} else {
  for (const source of ['sh', 'gh'] as const) {
    try {
      const client = new BoardClient(source);
      const body = await client.html(boardListURL(source));
      const folder = join(paths.raw, 'boards', source, 'probe');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'list.html'), body);
      const entries = parseBoardList(body, source).entries;
      if (entries[0]) writeFileSync(join(folder, 'detail.html'), await client.html(entries[0].url));
      console.log(
        `${source}: 게시판 접근 성공 · 모집 후보 ${entries.length}건 · 목록${entries[0] ? '·첫 상세' : ''} HTML 로컬 저장 · 아직 공고 DB에는 반영하지 않았습니다.`,
      );
    } catch (error) {
      console.log(
        `${source}: ${isRecord(error) ? String(error.publicCode ?? 'failed') : 'failed'} · ${error instanceof Error ? error.message : '게시판 접근 실패'}`,
      );
      process.exitCode = 1;
    }
  }
}
