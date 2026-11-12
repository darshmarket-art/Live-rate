import fs from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';

export interface Blob { data: Buffer; contentType: string }

/** Banner photos. One bucket for all stores in production (each under stores/<id>/), a folder on disk in development. */
export interface Blobs {
  put(name: string, data: Buffer, contentType: string): Promise<void>;
  get(name: string): Promise<Blob | null>;
  delete(name: string): Promise<void>;
}

export class MemoryBlobs implements Blobs {
  private files = new Map<string, Blob>();
  async put(name: string, data: Buffer, contentType: string) { this.files.set(name, { data: Buffer.from(data), contentType }); }
  async get(name: string) { return this.files.get(name) ?? null; }
  async delete(name: string) { this.files.delete(name); }
}

export class FileBlobs implements Blobs {
  constructor(private dir: string) {}
  private file(name: string) {
    const f = path.resolve(this.dir, name);
    if (!f.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('Invalid blob name');
    return f;
  }
  async put(name: string, data: Buffer) { const f = this.file(name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  async get(name: string) { const f = this.file(name); return fs.existsSync(f) ? { data: fs.readFileSync(f), contentType: 'image/jpeg' } : null; }
  async delete(name: string) { const f = this.file(name); if (fs.existsSync(f)) fs.unlinkSync(f); }
}

export class GcsBlobs implements Blobs {
  private bucket;
  constructor(name: string) { this.bucket = new Storage().bucket(name); }
  async put(name: string, data: Buffer, contentType: string) { await this.bucket.file(name).save(data, { contentType, resumable: false }); }
  async get(name: string) {
    const f = this.bucket.file(name);
    try {
      const [data] = await f.download();
      const [meta] = await f.getMetadata();
      return { data, contentType: String(meta.contentType || 'image/jpeg') };
    } catch (e: any) {
      if (e?.code === 404) return null;
      throw e;
    }
  }
  async delete(name: string) { await this.bucket.file(name).delete({ ignoreNotFound: true }); }
}

export function createBlobs(bucket: string | undefined, storeKind: string): Blobs {
  if (bucket) return new GcsBlobs(bucket);
  if (storeKind === 'file') return new FileBlobs(path.resolve(process.cwd(), 'data/uploads'));
  return new MemoryBlobs();
}
