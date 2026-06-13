export function RequireAdminPortal({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("ai-photo-studio-admin-access-token");
  if (!token) {
    window.location.href = "/admin/login";
    return null;
  }
  return <>{children}</>;
}