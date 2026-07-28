type PaginationProps = {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrevious = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="pagination-bar">
      <span className="helper-text">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="button-row">
        <button type="button" className="button button-small button-secondary" disabled={!canPrevious} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <button type="button" className="button button-small button-secondary" disabled={!canNext} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
