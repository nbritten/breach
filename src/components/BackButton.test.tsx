// @vitest-environment jsdom
import { act } from "react";
import { BrowserRouter, Link, useLocation } from "react-router-dom";
import { beforeEach, expect, it } from "vitest";
import { render } from "../test/render";
import { BackButton } from "./BackButton";

function Harness() {
  const location = useLocation();
  return <><BackButton /><Link to="/agents">Agents</Link><Link to="/terminal">Terminal</Link><input aria-label="Editor" /><output>{location.pathname}</output></>;
}
beforeEach(() => window.history.replaceState({ idx: 0 }, "", "/"));
async function settleBack() {
  // Browser history traversal dispatches popstate on a later task.
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 30)); });
}

it("disables back at the initial entry and returns to the actual previous route", async () => {
  const view = await render(<BrowserRouter><Harness /></BrowserRouter>);
  const back = view.container.querySelector("button")!;
  expect(back.disabled).toBe(true);
  await act(async () => view.container.querySelector<HTMLAnchorElement>('a[href="/agents"]')!.click());
  await act(async () => view.container.querySelector<HTMLAnchorElement>('a[href="/terminal"]')!.click());
  expect(back.disabled).toBe(false);
  await act(async () => back.click());
  await settleBack();
  expect(view.container.querySelector("output")?.textContent).toBe("/agents");
  await act(async () => back.click());
  await settleBack();
  expect(view.container.querySelector("output")?.textContent).toBe("/");
  expect(back.disabled).toBe(true);
  await view.unmount();
});

it("supports the shortcut without taking it from an editor", async () => {
  const view = await render(<BrowserRouter><Harness /></BrowserRouter>);
  await act(async () => view.container.querySelector<HTMLAnchorElement>('a[href="/agents"]')!.click());
  await act(async () => view.container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "[", metaKey: true, bubbles: true, cancelable: true })));
  expect(view.container.querySelector("output")?.textContent).toBe("/agents");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "[", metaKey: true, cancelable: true })));
  await settleBack();
  expect(view.container.querySelector("output")?.textContent).toBe("/");
  await view.unmount();
});
