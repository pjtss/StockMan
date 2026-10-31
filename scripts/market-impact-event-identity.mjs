export function effectiveMarketImpactEventKey(event) {
  return event.eventKey ?? "DEFAULT";
}

export function marketImpactEventIdentity(event) {
  return JSON.stringify([
    event.market,
    event.sourceType,
    event.sourceId,
    event.ticker,
    event.eventType,
    effectiveMarketImpactEventKey(event),
  ]);
}

export function findDuplicateMarketImpactEventIdentities(events) {
  const firstIndexByIdentity = new Map();
  const duplicates = [];
  for (const [index, event] of events.entries()) {
    const identity = marketImpactEventIdentity(event);
    const firstIndex = firstIndexByIdentity.get(identity);
    if (firstIndex !== undefined) {
      duplicates.push({
        firstIndex,
        duplicateIndex: index,
        eventId: events[firstIndex].eventId,
        duplicateEventId: event.eventId,
        eventKey: effectiveMarketImpactEventKey(event),
      });
    } else {
      firstIndexByIdentity.set(identity, index);
    }
  }
  return duplicates;
}
