import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    // Auto-redirect to home after a short delay — avoids stuck 404 on app launch
    const timer = setTimeout(() => navigate("/", { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [location.pathname, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page not found</p>
        <button onClick={() => navigate("/")} className="text-primary underline hover:text-primary/90">
          Return to Home
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Redirecting automatically...</p>
      </div>
    </div>
  );
};

export default NotFound;
