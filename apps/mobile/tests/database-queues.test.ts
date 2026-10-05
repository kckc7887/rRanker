import { expect, it } from 'vitest';
import { runDatabaseWrite, runSerializedSchemaInit } from '@/storage/rranker-database';

it('initializes the log database while an unrelated business write is pending', async () => {
  let finish!: () => void;
  const business = runDatabaseWrite(() => new Promise<void>((resolve) => { finish = resolve; }));
  let logInitialized = false;
  await runSerializedSchemaInit(async () => { logInitialized = true; }, 'runtime-log');
  expect(logInitialized).toBe(true);
  finish(); await business;
});
it('keeps business schema and transactions in the same queue after a failure', async () => {
  const order: string[] = [];
  const first = runDatabaseWrite(async () => { order.push('write'); throw new Error('locked'); });
  const second = runSerializedSchemaInit(async () => { order.push('schema'); });
  await expect(first).rejects.toThrow('locked'); await second;
  expect(order).toEqual(['write', 'schema']);
});
