import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { LibraryItem } from '../types/domain'
import type { LibraryRepository } from './LibraryRepository'

const DATABASE_NAME = 'videoplay'
const DATABASE_VERSION = 1

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  title TEXT NOT NULL,
  share_url TEXT NOT NULL,
  share_code TEXT,
  pan_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  file_json TEXT NOT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_played_at INTEGER,
  position_seconds REAL,
  duration_seconds REAL,
  last_probe_json TEXT
);
`

interface LibraryRow {
  id: string
  provider_id: string
  provider_name: string
  title: string
  share_url: string
  share_code?: string | null
  pan_type: LibraryItem['panType']
  resource_type: LibraryItem['resourceType']
  file_json: string
  favorited: number
  created_at: number
  updated_at: number
  last_played_at?: number | null
  position_seconds?: number | null
  duration_seconds?: number | null
  last_probe_json?: string | null
}

export class SqliteLibraryRepository implements LibraryRepository {
  private connection?: SQLiteConnection
  private database?: SQLiteDBConnection

  async initialize(): Promise<void> {
    if (this.database) return

    this.connection = new SQLiteConnection(CapacitorSQLite)
    const consistency = await this.connection.checkConnectionsConsistency()
    const existing = await this.connection.isConnection(DATABASE_NAME, false)

    if (consistency.result && existing.result) {
      this.database = await this.connection.retrieveConnection(DATABASE_NAME, false)
    } else {
      this.database = await this.connection.createConnection(
        DATABASE_NAME,
        false,
        'no-encryption',
        DATABASE_VERSION,
        false,
      )
    }

    const opened = await this.database.isDBOpen()
    if (!opened.result) await this.database.open()
    await this.database.execute(CREATE_TABLE_SQL)
  }

  async list(): Promise<LibraryItem[]> {
    const database = await this.getDatabase()
    const result = await database.query(
      'SELECT * FROM library_items ORDER BY COALESCE(last_played_at, created_at) DESC',
    )
    return (result.values ?? []).map((row) => this.rowToItem(row as LibraryRow))
  }

  async upsert(item: LibraryItem): Promise<void> {
    const database = await this.getDatabase()
    await database.run(
      `INSERT INTO library_items (
        id, provider_id, provider_name, title, share_url, share_code, pan_type,
        resource_type, file_json, favorited, created_at, updated_at,
        last_played_at, position_seconds, duration_seconds, last_probe_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        provider_name = excluded.provider_name,
        title = excluded.title,
        share_url = excluded.share_url,
        share_code = excluded.share_code,
        pan_type = excluded.pan_type,
        resource_type = excluded.resource_type,
        file_json = excluded.file_json,
        favorited = excluded.favorited,
        updated_at = excluded.updated_at,
        last_played_at = excluded.last_played_at,
        position_seconds = excluded.position_seconds,
        duration_seconds = excluded.duration_seconds,
        last_probe_json = excluded.last_probe_json`,
      [
        item.id,
        item.providerId,
        item.providerName,
        item.title,
        item.shareUrl,
        item.shareCode ?? null,
        item.panType,
        item.resourceType,
        JSON.stringify(item.file),
        item.favorited ? 1 : 0,
        item.createdAt,
        item.updatedAt,
        item.lastPlayedAt ?? null,
        item.positionSeconds ?? null,
        item.durationSeconds ?? null,
        item.lastProbe ? JSON.stringify(item.lastProbe) : null,
      ],
    )
  }

  async remove(id: string): Promise<void> {
    const database = await this.getDatabase()
    await database.run('DELETE FROM library_items WHERE id = ?', [id])
  }

  async clear(): Promise<void> {
    const database = await this.getDatabase()
    await database.execute('DELETE FROM library_items')
  }

  private async getDatabase(): Promise<SQLiteDBConnection> {
    if (!this.database) await this.initialize()
    if (!this.database) throw new Error('SQLite 数据库尚未初始化')
    return this.database
  }

  private rowToItem(row: LibraryRow): LibraryItem {
    return {
      id: row.id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      title: row.title,
      shareUrl: row.share_url,
      shareCode: row.share_code ?? undefined,
      panType: row.pan_type,
      resourceType: row.resource_type,
      file: JSON.parse(row.file_json),
      favorited: Boolean(row.favorited),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastPlayedAt: row.last_played_at ?? undefined,
      positionSeconds: row.position_seconds ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      lastProbe: row.last_probe_json ? JSON.parse(row.last_probe_json) : undefined,
    }
  }
}
