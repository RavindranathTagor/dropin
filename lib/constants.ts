export const HOLDING_STATUSES = [
  "commitment_pending",
  "minimum_occupancy_reached",
  "operator_accepted",
  "confirmed",
  "departed",
  "completed",
] as const;

export const HOLDING_SQL = `(${HOLDING_STATUSES.map((status) => `'${status}'`).join(",")})`;

export const VEHICLE_LABELS: Record<string, string> = {
  shared_car: "Shared car",
  tempo_traveller: "Tempo traveller",
  mini_bus: "Mini bus",
};

export const PICKUP_POINTS = [
  "Kengeri Metro",
  "Majestic",
  "Electronic City",
  "Silk Board",
  "Yeshwanthpur",
  "Banashankari",
];

export const VIBES = [
  { id: "college_squad", label: "College squad" },
  { id: "family", label: "Family" },
  { id: "office", label: "Office group" },
  { id: "quiet", label: "Quiet ride" },
] as const;

export const LANGUAGES = [
  { id: "en-IN", label: "English" },
  { id: "kn-IN", label: "Kannada" },
  { id: "hi-IN", label: "Hindi" },
  { id: "ta-IN", label: "Tamil" },
  { id: "te-IN", label: "Telugu" },
] as const;

export const DEMO_ACCOUNTS = [
  { role: "Passenger", email: "passenger@ghardrop.dev", password: "passenger123", name: "Ravindranath" },
  { role: "Passenger 2", email: "passenger2@ghardrop.dev", password: "passenger123", name: "Imad" },
  { role: "Operator", email: "operator@ghardrop.dev", password: "operator123", name: "Coastal Tempo Co." },
  { role: "Operator 2", email: "operator.malnad@ghardrop.dev", password: "operator123", name: "Malnad Travels" },
  { role: "Admin", email: "admin@ghardrop.dev", password: "admin123", name: "Dropin Ops" },
] as const;

export const DRILL_BID_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
export const DRILL_ROOM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

export const PRODUCT_EVENTS = [
  "search_started",
  "search_completed",
  "room_created",
  "room_joined",
  "commitment_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];
