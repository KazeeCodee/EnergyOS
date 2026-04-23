export function usd(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function number(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function percent(value: number, decimals = 0) {
  return `${number(value, decimals)}%`;
}
