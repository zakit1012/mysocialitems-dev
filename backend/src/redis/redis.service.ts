import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async del(key: string) {
    await this.client.del(key);
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
