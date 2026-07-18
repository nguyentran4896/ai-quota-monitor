export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Concurrency limit must be a positive integer.");
  }

  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export interface AsyncRequestCoalescer<Result> {
  run(): Promise<Result>;
  invalidate(): void;
}

export function createAsyncRequestCoalescer<Result>(
  task: () => Promise<Result>,
): AsyncRequestCoalescer<Result> {
  let inFlight: Promise<Result> | null = null;
  return {
    run() {
      if (inFlight) return inFlight;
      const request = Promise.resolve().then(task);
      inFlight = request;
      const clear = () => {
        if (inFlight === request) inFlight = null;
      };
      void request.then(clear, clear);
      return request;
    },
    invalidate() {
      inFlight = null;
    },
  };
}
