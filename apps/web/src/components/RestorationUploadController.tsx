import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RestorationUploadExperience } from "./RestorationUploadExperience";

type UploadController = { openRestorationUpload: () => void; closeRestorationUpload: () => void };
const UploadContext = createContext<UploadController | null>(null);

export function RestorationUploadController({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const openRestorationUpload = () => {
    navigate("/?upload=1");
    setOpen(true);
  };
  const closeRestorationUpload = () => {
    setOpen(false);
    if (location.search) navigate("/", { replace: true });
  };
  const routeOpen = location.pathname === "/" && new URLSearchParams(location.search).get("upload") === "1";
  return <UploadContext.Provider value={{ openRestorationUpload, closeRestorationUpload }}>{children}<RestorationUploadExperience open={open || routeOpen} onClose={closeRestorationUpload} /></UploadContext.Provider>;
}

export function useRestorationUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useRestorationUpload must be used inside RestorationUploadController");
  return context;
}
