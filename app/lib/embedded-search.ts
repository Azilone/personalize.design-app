export const buildEmbeddedSearch = (search: string): string => {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();

  for (const key of ["host", "embedded", "shop", "locale"] as const) {
    const value = current.get(key);
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `?${query}` : "";
};
