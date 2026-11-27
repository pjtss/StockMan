type QueryFlightGlobal = typeof globalThis & {
  __stockmanPublicDailyExportQueryFlightsV1?: Map<string, Promise<unknown>>;
};

function flights() {
  const root = globalThis as QueryFlightGlobal;
  root.__stockmanPublicDailyExportQueryFlightsV1 ??= new Map();
  return root.__stockmanPublicDailyExportQueryFlightsV1;
}

export function getOrLoadPublicDailyExportQuery<T>(key: string, load: () => Promise<T>) {
  const activeFlights = flights();
  const existing = activeFlights.get(key);
  if (existing) return { promise: existing as Promise<T>, coalesced: true };

  const promise = Promise.resolve().then(load);
  activeFlights.set(key, promise);
  const removeFlight = () => {
    if (activeFlights.get(key) === promise) activeFlights.delete(key);
  };
  void promise.then(removeFlight, removeFlight);
  return { promise, coalesced: false };
}

export function clearPublicDailyExportQueryFlights() {
  flights().clear();
}
