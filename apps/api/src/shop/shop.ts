// One shop per deployment; authenticated staff must belong to this shop.
export const SHOP_ID =
  process.env.APP_SHOP_ID ?? '00000000-0000-4000-8000-000000000001';
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    SHOP_ID,
  )
)
  throw new Error('APP_SHOP_ID must be a UUID.');
