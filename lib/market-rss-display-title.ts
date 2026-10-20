export function getMarketRssDisplayTitle(article: {
  title: string;
  translatedTitle?: string | null;
  translationFallback: boolean;
}) {
  return article.translationFallback ? article.title : article.translatedTitle || article.title;
}
