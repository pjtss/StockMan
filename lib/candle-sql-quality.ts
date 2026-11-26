/** PostgreSQL predicates shared by raw SQL candle readers. The caller aliases its source table. */
export function validDailyCandleSql(alias: string) {
  return validDailyCandlePredicate(alias);
}

export function validDailyCandlePredicate(alias: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error("INVALID_CANDLE_SQL_ALIAS");
  return `CASE WHEN ${alias}.candle_date ~ '^[0-9]{8}$' THEN
      substring(${alias}.candle_date, 1, 4)::integer BETWEEN 1 AND 9999
      AND substring(${alias}.candle_date, 5, 2)::integer BETWEEN 1 AND 12
      AND substring(${alias}.candle_date, 7, 2)::integer BETWEEN 1 AND CASE substring(${alias}.candle_date, 5, 2)::integer
        WHEN 2 THEN CASE WHEN substring(${alias}.candle_date, 1, 4)::integer % 400 = 0 OR (substring(${alias}.candle_date, 1, 4)::integer % 4 = 0 AND substring(${alias}.candle_date, 1, 4)::integer % 100 <> 0) THEN 29 ELSE 28 END
        WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30
        ELSE 31 END
    ELSE false END
    AND ${alias}.open > 0 AND ${alias}.high > 0 AND ${alias}.low > 0 AND ${alias}.close > 0 AND ${alias}.volume >= 0
    AND ${alias}.open < 'Infinity'::numeric
    AND ${alias}.high < 'Infinity'::numeric
    AND ${alias}.low < 'Infinity'::numeric
    AND ${alias}.close < 'Infinity'::numeric
    AND ${alias}.volume < 'Infinity'::numeric
    AND ${alias}.high >= GREATEST(${alias}.open, ${alias}.low, ${alias}.close)
    AND ${alias}.low <= LEAST(${alias}.open, ${alias}.high, ${alias}.close)`;
}
