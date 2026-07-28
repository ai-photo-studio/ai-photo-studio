export const formatMoney = (value: number | string, currency = "PKR") =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value));

export const formatNumber = (value: number | string) =>
  new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0
  }).format(Number(value));

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};
