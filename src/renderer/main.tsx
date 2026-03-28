import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import { App } from "./App";
import { Toaster } from "sonner";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <>
      <App />
      <Toaster position="bottom-right" theme="dark" richColors toastOptions={{ style: { background: '#1a1b1f', border: '1px solid #26282e', color: '#e2e8f0' } }} />
    </>
  </React.StrictMode>
);