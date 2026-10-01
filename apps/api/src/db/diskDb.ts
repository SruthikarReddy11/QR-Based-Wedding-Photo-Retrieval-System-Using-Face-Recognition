import fs from 'fs';
import path from 'path';

export interface DbSchema {
  users: Record<string, any>;
  photographers: Record<string, any>;
  events: Record<string, any>;
  photos: Record<string, any>;
  faces: Record<string, any[]>; // eventId -> StoredFace[]
}

class DiskDatabase {
  private dbPath: string;
  public users: Map<string, any> = new Map();
  public photographers: Map<string, any> = new Map();
  public events: Map<string, any> = new Map();
  public photos: Map<string, any> = new Map();
  public faces: Map<string, any[]> = new Map();

  constructor() {
    // Save inside project data directory
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'wednap_db.json');
    this.load();
  }

  public load(): void {
    if (!fs.existsSync(this.dbPath)) {
      console.log(`[DiskDB] Initialized fresh database at ${this.dbPath}`);
      this.save();
      return;
    }

    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const data: DbSchema = JSON.parse(raw);

      this.users = new Map(Object.entries(data.users || {}));
      this.photographers = new Map(Object.entries(data.photographers || {}));
      this.events = new Map(Object.entries(data.events || {}));
      this.photos = new Map(Object.entries(data.photos || {}));
      this.faces = new Map(Object.entries(data.faces || {}));

      console.log(`[DiskDB] Loaded persistent data: ${this.events.size} event(s), ${this.photos.size} photo(s), ${this.users.size} user(s).`);
    } catch (err: any) {
      console.error(`[DiskDB] Could not load database from disk: ${err.message}. Starting fresh.`);
    }
  }

  public save(): void {
    try {
      const data: DbSchema = {
        users: Object.fromEntries(this.users.entries()),
        photographers: Object.fromEntries(this.photographers.entries()),
        events: Object.fromEntries(this.events.entries()),
        photos: Object.fromEntries(this.photos.entries()),
        faces: Object.fromEntries(this.faces.entries()),
      };

      const tmpPath = `${this.dbPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.dbPath);
    } catch (err: any) {
      console.error(`[DiskDB] Failed to save database to disk: ${err.message}`);
    }
  }
}

export const diskDb = new DiskDatabase();
