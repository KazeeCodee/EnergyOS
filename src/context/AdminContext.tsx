import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type AdminFilters = {
  empresaId: string | null;
  empresaNombre: string | null;
  nemo: string | null;
  anio: number;
  mes: number;
};

type AdminContextValue = {
  filters: AdminFilters;
  setFilters: (updater: AdminFilters | ((current: AdminFilters) => AdminFilters)) => void;
  selectEmpresa: (empresa: { id: string | null; nombre?: string | null }) => void;
  setNemo: (nemo: string | null) => void;
  setPeriodo: (periodo: { anio: number; mes: number }) => void;
  resetFilters: () => void;
};

function getArgDateParts(): { anio: number; mes: number } {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { anio: get("year"), mes: get("month") };
}

const initialFilters: AdminFilters = {
  empresaId: null,
  empresaNombre: null,
  nemo: null,
  ...getArgDateParts(),
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: PropsWithChildren) {
  const [filters, setFiltersState] = useState<AdminFilters>(initialFilters);

  const setFilters: AdminContextValue["setFilters"] = (updater) => {
    setFiltersState((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
  };

  const value = useMemo<AdminContextValue>(
    () => ({
      filters,
      setFilters,
      selectEmpresa: ({ id, nombre }) => {
        setFiltersState((current) => ({
          ...current,
          empresaId: id,
          empresaNombre: nombre ?? null,
          nemo: null,
        }));
      },
      setNemo: (nemo) => {
        setFiltersState((current) => ({ ...current, nemo }));
      },
      setPeriodo: ({ anio, mes }) => {
        setFiltersState((current) => ({ ...current, anio, mes }));
      },
      resetFilters: () => {
        setFiltersState(initialFilters);
      },
    }),
    [filters],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdminContext debe usarse dentro de AdminProvider.");
  }
  return context;
}
