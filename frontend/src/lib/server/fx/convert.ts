import 'server-only';

// The actual implementation is shared with client code (list pages need the
// same conversion the API aggregations use) — see lib/currencyConvert.ts's
// header comment for why it can't live under lib/server/.
export { sumConverted, type ConvertibleRow, type ConvertedTotal } from '@/lib/currencyConvert';
