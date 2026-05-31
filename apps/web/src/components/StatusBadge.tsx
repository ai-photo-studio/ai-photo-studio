type StatusBadgeProps = {
  value: string;
};

const bgByStatus: Record<string, string> = {
  PAID: "#dcfce7",
  PENDING: "#fef3c7",
  PROCESSING: "#dbeafe",
  COMPLETED: "#dcfce7",
  FAILED: "#fee2e2"
};

export function StatusBadge({ value }: StatusBadgeProps) {
  return (
    <span
      style={{
        background: bgByStatus[value] || "#e5e7eb",
        color: "#111827",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {value}
    </span>
  );
}
