/**
 * Chainable mock Supabase client for testing.
 *
 * Usage:
 *   const { client, tracker } = createMockSupabase({ memory_items: [...] });
 *   // ...call code under test...
 *   expect(tracker.inserts('memory_items')).toHaveLength(1);
 */

type MockRow = object;

interface MutationRecord {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  args: unknown;
  filters: Record<string, unknown>;
}

interface QueryRecord {
  table: string;
  operation: 'select';
  args: unknown;
  filters: Record<string, unknown>;
}

interface RpcRecord {
  fn: string;
  args: unknown;
}

export interface MutationTracker {
  mutations: MutationRecord[];
  queries: QueryRecord[];
  rpcs: RpcRecord[];
  inserts: (table: string) => MutationRecord[];
  updates: (table: string) => MutationRecord[];
  upserts: (table: string) => MutationRecord[];
  deletes: (table: string) => MutationRecord[];
  selects: (table: string) => QueryRecord[];
}

interface TableConfig {
  rows: MockRow[];
  /** Rows returned by .select().single() after an insert/update. Shifts one per call. */
  returnOnMutate?: MockRow[];
  mutateError?:
    | unknown
    | ((operation: 'insert' | 'update' | 'upsert' | 'delete', args: unknown) => unknown);
}

interface MockSupabaseOptions {
  tables?: Record<string, TableConfig>;
  rpcResults?: Record<string, { data?: unknown; error?: unknown }>;
}

export function createMockSupabase(options: MockSupabaseOptions = {}) {
  const tables = options.tables ?? {};
  const rpcResults = options.rpcResults ?? {};

  const mutations: MutationRecord[] = [];
  const queries: QueryRecord[] = [];
  const rpcs: RpcRecord[] = [];

  const tracker: MutationTracker = {
    mutations,
    queries,
    rpcs,
    inserts: (table) => mutations.filter((m) => m.table === table && m.operation === 'insert'),
    updates: (table) => mutations.filter((m) => m.table === table && m.operation === 'update'),
    upserts: (table) => mutations.filter((m) => m.table === table && m.operation === 'upsert'),
    deletes: (table) => mutations.filter((m) => m.table === table && m.operation === 'delete'),
    selects: (table) => queries.filter((q) => q.table === table),
  };

  function buildChain(table: string, operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete', args?: unknown) {
    const filters: Record<string, unknown> = {};
    let singleMode: 'single' | 'maybeSingle' | null = null;
    let selectCalled = false;

    const chain: Record<string, unknown> = {};

    // Filter methods
    for (const method of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is'] as const) {
      chain[method] = (col: string, val: unknown) => {
        filters[`${method}:${col}`] = val;
        return chain;
      };
    }

    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = () => {
      singleMode = 'single';
      return chain;
    };
    chain.maybeSingle = () => {
      singleMode = 'maybeSingle';
      return chain;
    };
    chain.select = (cols?: string) => {
      selectCalled = true;
      return chain;
    };

    // Terminal: make the chain thenable so `await supabase.from(...).select(...)` works
    chain.then = (resolve: (val: unknown) => void, reject: (err: unknown) => void) => {
      try {
        if (operation !== 'select') {
          const tableConf = tables[table];
          const mutateError = typeof tableConf?.mutateError === 'function'
            ? tableConf.mutateError(operation, args)
            : tableConf?.mutateError;

          mutations.push({ table, operation, args, filters });

          if (mutateError) {
            resolve({ data: null, error: mutateError });
            return;
          }

          const mutateReturn = tableConf?.returnOnMutate?.shift();

          if (selectCalled && singleMode && mutateReturn) {
            resolve({ data: mutateReturn, error: null });
          } else if (selectCalled && singleMode) {
            // Return the args as the "inserted/updated" row
            resolve({ data: args, error: null });
          } else {
            resolve({ data: null, error: null });
          }
        } else {
          // SELECT path — return matching rows from config
          const tableConf = tables[table];
          const rows = tableConf?.rows ?? [];
          queries.push({ table, operation, args, filters });

          if (singleMode === 'single') {
            resolve({
              data: rows[0] ?? null,
              error: rows.length === 0 ? { message: 'not found' } : null,
            });
          } else if (singleMode === 'maybeSingle') {
            resolve({ data: rows[0] ?? null, error: null });
          } else {
            resolve({ data: rows, error: null });
          }
        }
      } catch (err) {
        reject(err);
      }
    };

    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: (cols?: string) => buildChain(table, 'select', cols),
      insert: (data: unknown) => buildChain(table, 'insert', data),
      update: (data: unknown) => buildChain(table, 'update', data),
      upsert: (data: unknown, opts?: unknown) => buildChain(table, 'upsert', data),
      delete: () => buildChain(table, 'delete'),
    }),
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      const result = rpcResults[fn];
      if (!result && fn === 'consume_chat_usage_limits') {
        return Promise.resolve({
          data: [{
            allowed: true,
            monthly_used_count: 1,
            monthly_limit: 250,
            window_used_count: 1,
            window_limit: 20,
            monthly_premium_used_count: 0,
            monthly_premium_limit: 0,
            window_premium_used_count: 0,
            window_premium_limit: 0,
            blocked_limit: null,
          }],
          error: null,
        });
      }
      return Promise.resolve(result ?? { data: [], error: null });
    },
  };

  return { client, tracker };
}
