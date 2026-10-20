import { staffContext } from '../auth/context.js';
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
    let actorSet = false;
    try {
      client = await this.pool.connect();
      const actor = staffContext.getStore()?.actorId;
      if (actor) {
        await client.query("SELECT set_config('app.staff_id',$1,false)", [
          actor,
        ]);
        actorSet = true;
      }
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
          'This record already exists. Refresh and check the register before retrying.',
        );
      console.error('Database operation failed.');
      throw new ServiceUnavailableException(
        'Storage is unavailable. Start the database and run migrations.',
      );
    } finally {
      if (client) {
        try {
          if (actorSet) await client.query('RESET app.staff_id');
          client.release();
        } catch {
          client.release(true);
        }
      }
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
