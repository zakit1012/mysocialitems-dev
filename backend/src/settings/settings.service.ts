import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Key/value settings the super admin edits at runtime.
 *
 * Secrets (PayPal client secrets) are encrypted with AES-256-GCM before they
 * touch the database, so a leaked backup does not leak live payment keys.
 * The key comes from SETTINGS_SECRET, falling back to JWT_SECRET. Change it
 * and stored secrets become unreadable - re-enter them in the admin panel.
 */
@Injectable()
export class SettingsService {
  private readonly log = new Logger(SettingsService.name);
  private cache: Map<string, string> | null = null;
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private key(): Buffer {
    const source =
      this.config.get<string>('SETTINGS_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      'socialdeal-dev-secret';
    return createHash('sha256').update(source).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  private decrypt(stored: string): string | null {
    try {
      const [version, iv, tag, data] = stored.split(':');
      if (version !== 'v1') return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      this.log.error(
        'A stored secret could not be decrypted - was SETTINGS_SECRET changed?',
      );
      return null;
    }
  }

  private async load(): Promise<Map<string, string>> {
    // Short cache: read on every PayPal call, changed rarely.
    if (this.cache && Date.now() - this.cachedAt < 30_000) return this.cache;
    const rows = await this.prisma.appSetting.findMany();
    const map = new Map<string, string>();
    for (const row of rows) {
      const value = row.secret ? this.decrypt(row.value) : row.value;
      if (value !== null) map.set(row.key, value);
    }
    this.cache = map;
    this.cachedAt = Date.now();
    return map;
  }

  /** DB value first, then the env var of the same name, so .env still works. */
  async get(key: string): Promise<string | undefined> {
    const map = await this.load();
    return map.get(key) || this.config.get<string>(key) || undefined;
  }

  async set(key: string, value: string, secret = false) {
    if (value === '') {
      await this.prisma.appSetting.deleteMany({ where: { key } });
    } else {
      const stored = secret ? this.encrypt(value) : value;
      await this.prisma.appSetting.upsert({
        where: { key },
        update: { value: stored, secret },
        create: { key, value: stored, secret },
      });
    }
    this.cache = null;
  }

  /** For the admin UI: never the secret itself, only whether it is set. */
  static mask(value: string | undefined): string {
    if (!value) return '';
    return value.length > 8 ? `••••${value.slice(-4)}` : '••••';
  }
}
