export const inventoryColumns = `id, item_code AS "itemCode", name, category, metal, fineness,
  gross_weight_grams AS "grossWeightGrams", non_metal_weight_grams AS "nonMetalWeightGrams",
  net_weight_grams AS "netWeightGrams", fine_weight_grams AS "fineWeightGrams",
  grams_per_tola AS "gramsPerTola", notes, status, active_sale_id AS "activeSaleId",
  to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "receivedAt"`;
