export type PoolConfig = {
  vehicle_thresholds: {
    shared_car: number;
    tempo_traveller: number;
    mini_bus: number;
  };
  minimum_confirmation_ratio: number;
  default_currency: string;
  default_departure_period: string;
};

export type FlagSnapshot = {
  voice_trip_search: boolean;
  operator_voice_bid: boolean;
  amma_mode: boolean;
  vibe_filters: boolean;
  corridor_pickup: boolean;
  reality_check: boolean;
  christmas_drop_mode: boolean;
  booking_writes_paused: boolean;
  pool_config: PoolConfig;
  voice_launch_experiment: "voice_first" | "text_first";
  source: "flagsmith" | "defaults";
};

export const DEFAULT_POOL: PoolConfig = {
  vehicle_thresholds: {
    shared_car: 4,
    tempo_traveller: 12,
    mini_bus: 20,
  },
  minimum_confirmation_ratio: 0.75,
  default_currency: "INR",
  default_departure_period: "night",
};

export const DEFAULT_FLAGS: FlagSnapshot = {
  voice_trip_search: true,
  operator_voice_bid: true,
  amma_mode: true,
  vibe_filters: true,
  corridor_pickup: true,
  reality_check: true,
  christmas_drop_mode: true,
  booking_writes_paused: false,
  pool_config: DEFAULT_POOL,
  voice_launch_experiment: "voice_first",
  source: "defaults",
};

type RemoteFlag = {
  feature?: { name?: string };
  feature_name?: string;
  enabled?: boolean;
  feature_state_value?: unknown;
};

export async function getFlags(identity: string): Promise<FlagSnapshot> {
  const key = process.env.FLAGSMITH_SERVER_KEY || process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY;
  if (!key) return { ...DEFAULT_FLAGS, pool_config: { ...DEFAULT_POOL, vehicle_thresholds: { ...DEFAULT_POOL.vehicle_thresholds } } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      `https://edge.api.flagsmith.com/api/v1/identities/?identifier=${encodeURIComponent(identity)}`,
      {
        headers: { "X-Environment-Key": key },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) return { ...DEFAULT_FLAGS, source: "defaults" };
    const body = (await response.json()) as { flags?: RemoteFlag[] };
    return applyRemote(body.flags ?? []);
  } catch {
    return { ...DEFAULT_FLAGS, source: "defaults" };
  } finally {
    clearTimeout(timer);
  }
}

function applyRemote(flags: RemoteFlag[]): FlagSnapshot {
  const next: FlagSnapshot = {
    ...DEFAULT_FLAGS,
    pool_config: {
      ...DEFAULT_POOL,
      vehicle_thresholds: { ...DEFAULT_POOL.vehicle_thresholds },
    },
    source: "flagsmith",
  };
  for (const flag of flags) {
    const name = flag.feature?.name || flag.feature_name;
    if (!name) continue;
    if (name === "pool_config") {
      next.pool_config = readPool(flag.feature_state_value);
      continue;
    }
    if (name === "voice_launch_experiment") {
      const value = String(flag.feature_state_value || "");
      next.voice_launch_experiment = value === "text_first" ? "text_first" : "voice_first";
      continue;
    }
    if (name in next && typeof next[name as keyof FlagSnapshot] === "boolean") {
      (next as unknown as Record<string, boolean>)[name] = Boolean(flag.enabled);
    }
  }
  return next;
}

function readPool(value: unknown): PoolConfig {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return DEFAULT_POOL;
    const record = parsed as Partial<PoolConfig>;
    return {
      ...DEFAULT_POOL,
      ...record,
      vehicle_thresholds: {
        ...DEFAULT_POOL.vehicle_thresholds,
        ...(record.vehicle_thresholds ?? {}),
      },
    };
  } catch {
    return DEFAULT_POOL;
  }
}

export async function tryEnablePauseFlag() {
  const token = process.env.FLAGSMITH_API_TOKEN;
  const featureStateId = process.env.FLAGSMITH_PAUSE_FEATURE_STATE_ID;
  if (!token || !featureStateId) return { updated: false, reason: "not_configured" };
  try {
    const response = await fetch(`https://api.flagsmith.com/api/v1/features/feature-states/${featureStateId}/`, {
      method: "PATCH",
      headers: {
        Authorization: `Api-Key ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    });
    return { updated: response.ok, status: response.status };
  } catch {
    return { updated: false, reason: "request_failed" };
  }
}
