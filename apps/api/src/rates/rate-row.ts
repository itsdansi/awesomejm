export const rateColumns = `id, rate_date::text AS "rateDate", metal, fineness, currency,
  buy_rate_per_tola AS "buyRatePerTola", sell_rate_per_tola AS "sellRatePerTola",
  grams_per_tola AS "gramsPerTola", source, reason, revision,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
