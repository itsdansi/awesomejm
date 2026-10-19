import {
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import pg from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm',
    connectionTimeoutMillis: 5000,
    max: 10,
  });

  constructor() {
    this.pool.on('error', () =>
      console.error('An idle database connection failed.'),
    );
  }

  async run<T>(
    operation: (client: pg.PoolClient) => Promise<T>,
    transaction = false,
  ): Promise<T> {
    let client: pg.PoolClient | undefined;
    try {
      client = await this.pool.connect();
      if (transaction) await client.query('BEGIN');
      const result = await operation(client);
      if (transaction) await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client && transaction)
        await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && 'code' in error && error.code === '23505')
        throw new ConflictException(
          'That item code already exists. Use a unique code, including for voided items.',
        );
      console.error('Inventory database operation failed.');
      throw new ServiceUnavailableException(
        'Inventory storage is unavailable. Start the database and run migrations.',
      );
    } finally {
      client?.release();
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
