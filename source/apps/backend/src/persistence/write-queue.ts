// One serialized write queue for every persistent write of this process.
//
// Why a single queue: writes reach PostgreSQL in exactly the order the in-memory
// state changed, so a stale snapshot can never overwrite a newer one, and a
// reservation row is always stored before the order row that references it.
// Each queued job re-reads the CURRENT in-memory state when it runs and upserts
// the full row, so a lost or retried write heals itself on the next one.

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly retryDelaysMs: number[] = [100, 500, 2000]) {}

  /**
   * Queues `job`. The returned promise settles with the job's own outcome.
   * Fire-and-forget callers must attach a `.catch`. `retries` defaults to the
   * configured backoff list; use 0 on request paths that must answer quickly.
   */
  enqueue(label: string, job: () => Promise<void>, opts: { retries?: number } = {}): Promise<void> {
    const retries = Math.min(opts.retries ?? this.retryDelaysMs.length, this.retryDelaysMs.length);
    const run = async (): Promise<void> => {
      for (let attempt = 0; ; attempt++) {
        try {
          await job();
          return;
        } catch (err: any) {
          if (attempt >= retries) {
            console.error(`PERSIST_FAILED label=${label} attempts=${attempt + 1} error=${err?.message ?? err}`);
            throw err;
          }
          await sleep(this.retryDelaysMs[attempt]);
        }
      }
    };
    const result = this.tail.then(run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves when every job queued so far has settled (never rejects). */
  idle(): Promise<void> {
    return this.tail;
  }
}
