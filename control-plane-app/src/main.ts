import { mount } from "svelte";
import App from "./App.svelte";
import "../../assets/codebase-state-dashboard/dashboard-tokens.css";
import "./styles.css";
const target = document.getElementById("app");

if (target === null) {
  throw new Error("Control-plane application root was not found.");
}

mount(App, { target });
