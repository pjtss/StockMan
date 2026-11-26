import { describe, expect, it } from "vitest";
import { validDailyCandlePredicate, validDailyCandleSql } from "./candle-sql-quality";

describe("daily candle SQL quality predicate", () => {
  it("qualifies the exact table alias before selecting recent rows", () => {
    const predicate = validDailyCandlePredicate("c");
    expect(predicate).toContain("CASE WHEN c.candle_date ~ '^[0-9]{8}$' THEN");
    expect(predicate).toContain("substring(c.candle_date, 5, 2)::integer BETWEEN 1 AND 12");
    expect(predicate).toContain("substring(c.candle_date, 7, 2)::integer BETWEEN 1 AND CASE");
    expect(predicate).toContain("c.candle_date, 1, 4)::integer % 400 = 0");
    expect(predicate).toContain("c.high >= GREATEST(c.open, c.low, c.close)");
    expect(predicate).toContain("c.low <= LEAST(c.open, c.high, c.close)");
    expect(predicate).toContain("c.volume >= 0");
    expect(predicate).toContain("c.open < 'Infinity'::numeric");
    expect(predicate).toContain("c.volume < 'Infinity'::numeric");
    expect(predicate).not.toContain("::text NOT IN ('NaN','Infinity','-Infinity')");
  });

  it("rejects interpolated aliases outside the SQL identifier grammar", () => {
    expect(() => validDailyCandleSql("c; DROP TABLE daily_candles")).toThrow("INVALID_CANDLE_SQL_ALIAS");
    expect(() => validDailyCandlePredicate("c\" WHERE true --")).toThrow("INVALID_CANDLE_SQL_ALIAS");
  });
});
