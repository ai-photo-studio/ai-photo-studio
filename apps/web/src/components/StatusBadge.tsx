type StatusBadgeProps = {
  value: string;
};

const bgByStatus: Record<string, string> = {
  PAID: "#dcfce7",
  PENDING: "#fef3c7",
  PROCESSING: "#dbeafe",
  COMPLETED: "#dcfce7",
  FAILED: "#fee2e2",
  APPROVED: "#dcfce7",
  REJECTED: "#fee2e2",
  RESERVED: "#e0f2fe",
  ACTIVE: "#dcfce7",
  INACTIVE: "#f3f4f6",
  RUNNING: "#dbeafe",
  DEAD_LETTER: "#fca5a5"
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
