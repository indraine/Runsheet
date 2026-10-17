/* @refresh reload */
import { render } from "solid-js/web";
import { Shell } from "~/features/shell/shell";
import "~/index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root is missing from index.html");
}

render(() => <Shell />, root);
