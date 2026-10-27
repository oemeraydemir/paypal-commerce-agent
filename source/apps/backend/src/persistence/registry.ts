import { Repositories } from './types';
import { WriteQueue } from './write-queue';

// Process-wide handle to the (optional) durable repositories. When none is set the
// app behaves exactly as before (pure in-memory), which keeps unit tests and
// local catalog-only runs dependency-free.
let repositories: Repositories | null = null;

export const writeQueue = new WriteQueue();

export function getRepos(): Repositories | null {
  return repositories;
}

export function setRepos(next: Repositories | null): void {
  repositories = next;
}

export function isPersistent(): boolean {
  return repositories !== null;
}

// Components with fire-and-forget writes register a retrier for writes that
// failed even after backoff ("dirty" rows). The sweeper calls retryDirtyAll().
type Retrier = () => Promise<number>;
const retriers: Retrier[] = [];

export function registerRetrier(retrier: Retrier): void {
  if (!retriers.includes(retrier)) retriers.push(retrier);
}

export async function retryDirtyAll(): Promise<number> {
  if (!repositories) return 0;
  let total = 0;
  for (const retrier of retriers) {
    try {
      total += await retrier();
    } catch (err: any) {
      console.error(`PERSIST_RETRY_FAILED error=${err?.message ?? err}`);
    }
  }
  return total;
}
