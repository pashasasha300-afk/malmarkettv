import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
const Admin = lazy(() => import("./Admin"));
createRoot(document.getElementById("root")!).render(
  location.pathname === "/admin" ? (
    <Suspense fallback={<p>加载管理工具…</p>}>
      <Admin />
    </Suspense>
  ) : (
    <App />
  ),
);
