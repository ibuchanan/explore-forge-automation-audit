import { Form, ErrorMessage, Text, Textfield, Label } from "@forge/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { submit, productContext } = vi.hoisted(() => ({
  submit: vi.fn(),
  productContext: vi.fn(),
}));
vi.mock("@forge/bridge", () => ({ view: { submit } }));
vi.mock("@forge/react", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  // Keep Forge's real form behavior; substitute only host components and Bridge.
  const { useForm } = require(
    join(dirname(require.resolve("@forge/react")), "hooks/useForm.js"),
  ) as typeof import("@forge/react");
  return {
    default: { render: vi.fn() },
    useForm,
    useProductContext: productContext,
    Form: "Form",
    Label: "Label",
    Textfield: "Textfield",
    HelperMessage: "HelperMessage",
    ErrorMessage: "ErrorMessage",
    Text: "Text",
  };
});
import { AutomationConfig } from "../src/frontend";

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.resetAllMocks();
  productContext.mockReturnValue({
    extension: { data: { inputs: { ruleUuid: "{{rule.uuid}}" } } },
  });
  submit.mockResolvedValue(undefined);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

it("shows save failures safely and clears the error after a successful retry", async () => {
  submit.mockRejectedValueOnce(new Error("sensitive bridge details"));
  await act(async () => {
    renderer = create(<AutomationConfig />);
  });
  await act(async () => {
    await renderer.root.findByType(Form).props["onSubmit"]();
  });
  expect(renderer.root.findByType(ErrorMessage).props["children"]).toBe(
    "Unable to save configuration. Try again.",
  );
  await act(async () => {
    await renderer.root.findByType(Form).props["onSubmit"]();
  });
  expect(renderer.root.findAllByType(ErrorMessage)).toHaveLength(0);
});

it("shows a required error and prevents an empty native Next submission", async () => {
  productContext.mockReturnValue({ extension: { data: { inputs: {} } } });
  await act(async () => {
    renderer = create(<AutomationConfig />);
  });
  await act(async () => {
    await renderer.root.findByType(Form).props["onSubmit"]();
  });
  expect(submit).not.toHaveBeenCalled();
  expect(renderer.root.findByType(ErrorMessage).props["children"]).toBe(
    "Rule UUID is required",
  );
});

it("shows loading until the configuration context is ready", async () => {
  productContext.mockReturnValue(undefined);
  await act(async () => {
    renderer = create(<AutomationConfig />);
  });
  expect(renderer.root.findByType(Text).props["children"]).toBe(
    "Loading configuration...",
  );
  expect(renderer.root.findAllByType(Form)).toHaveLength(0);
});

it("persists edited smart values through Bridge and native Next submission", async () => {
  await act(async () => {
    renderer = create(<AutomationConfig />);
  });
  await act(async () => {
    await renderer.root.findByType(Textfield).props["onChange"]({
      target: { type: "text", value: "{{selectedRule.uuid}}" },
    });
  });
  expect(submit).toHaveBeenLastCalledWith({
    ruleUuid: "{{selectedRule.uuid}}",
  });
  await act(async () => {
    await renderer.root.findByType(Form).props["onSubmit"]();
  });
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenLastCalledWith({
    ruleUuid: "{{selectedRule.uuid}}",
  });
});

it("restores the saved rule input and labels the required field", async () => {
  await act(async () => {
    renderer = create(<AutomationConfig />);
  });
  const field = renderer.root.findByType(Textfield);
  expect(field.props["defaultValue"]).toBe("{{rule.uuid}}");
  expect(field.props["isRequired"]).toBe(true);
  expect(renderer.root.findByType(Label).props["labelFor"]).toBe(
    field.props["id"],
  );
  expect(submit).not.toHaveBeenCalled();
});
