import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { AppContextProvider } from "./context/AppContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AppContextProvider>
          <App />
        </AppContextProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
