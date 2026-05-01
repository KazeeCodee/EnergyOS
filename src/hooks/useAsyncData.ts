import { useEffect, useRef, useState } from "react";

export function useAsyncData<T>(
  loader: () => Promise<T>,
  initialData: T,
  options: { skip?: boolean } = {},
) {
  const skip = Boolean(options.skip);
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState("");
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    loaderRef.current()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "No se pudieron cargar los datos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loader, skip]);

  return { data, error, loading };
}
