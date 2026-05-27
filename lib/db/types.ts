export interface Repository<T extends { id?: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(row: T): Promise<T>;
  remove(id: string): Promise<void>;
}
