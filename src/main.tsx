import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./components/import-wizard/styles.css";

createRoot(document.getElementById("root")!).render(<App />);
