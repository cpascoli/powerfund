/** Yahoo/Tiingo/Stooq/SEC ticker when it differs from the house symbol. */
export function vendorSymbol(
  symbol: string,
  dataSymbol?: string | null,
): string {
  const mapped = dataSymbol?.trim();
  return mapped && mapped.length > 0 ? mapped : symbol;
}
