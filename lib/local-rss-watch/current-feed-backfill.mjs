/** Explicit one-shot bootstrap for items already present in an initialized feed. */
export async function queueCurrentFeedBackfill({ feeds, fetchFeed, store, now = () => new Date() }) {
  if (!Array.isArray(feeds) || typeof fetchFeed !== "function" || typeof store?.queueInitialBackfill !== "function") {
    throw new Error("RSS 초기 backfill 입력값이 올바르지 않습니다.");
  }

  const fetched = await Promise.all(feeds.map(async (feed) => {
    try {
      return { feed, parsed: await fetchFeed(feed) };
    } catch (error) {
      return { feed, error };
    }
  }));

  const summaries = [];
  const failedSources = [];
  const errors = [];
  let newCount = 0;
  for (const { feed, parsed, error } of fetched) {
    if (error) {
      failedSources.push(feed.source);
      errors.push({ source: feed.source, message: error instanceof Error ? error.message : "알 수 없는 오류" });
      continue;
    }
    try {
      const result = store.queueInitialBackfill(feed.source, parsed.items, now().toISOString());
      summaries.push(result);
      newCount += result.newItems;
    } catch (storeError) {
      failedSources.push(feed.source);
      errors.push({ source: feed.source, message: storeError instanceof Error ? storeError.message : "알 수 없는 저장 오류" });
    }
  }

  return {
    ok: failedSources.length < feeds.length,
    csvPath: store.csvPath,
    statePath: store.statePath,
    backfill: true,
    newCount,
    failedSources,
    errors,
    feeds: summaries,
  };
}
