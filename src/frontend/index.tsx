import { view } from "@forge/bridge";
import ForgeReconciler, {
  Form,
  Label,
  Text,
  Textfield,
  ErrorMessage,
  HelperMessage,
  useForm,
  useProductContext,
} from "@forge/react";

import React, { useState } from "react";

function RuleForm({ ruleUuid }: { ruleUuid: string }) {
  const [saveError, setSaveError] = useState(false);
  const save = async (data: { ruleUuid: string }) => {
    try {
      await view.submit(data);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const { register, getFieldId, handleSubmit, formState } = useForm({
    defaultValues: { ruleUuid },
  });
  const { onChange, ...field } = register("ruleUuid", {
    required: "Rule UUID is required",
    validate: (value) => value.trim().length > 0 || "Rule UUID is required",
  });
  return (
    <Form onSubmit={handleSubmit(save)}>
      <Label labelFor={getFieldId("ruleUuid")}>Rule UUID</Label>
      <Textfield
        {...field}
        isRequired
        onChange={async (event) => {
          await onChange(event);
          // Persist only values that pass the same validation as submit.
          if (event.target.value.trim()) {
            await save({ ruleUuid: event.target.value });
          }
        }}
      />
      <HelperMessage>
        Enter a rule UUID or smart value, not a numeric legacy rule ID.
      </HelperMessage>
      {formState.errors.ruleUuid?.message && (
        <ErrorMessage>{formState.errors.ruleUuid.message}</ErrorMessage>
      )}
      {saveError && (
        <ErrorMessage>Unable to save configuration. Try again.</ErrorMessage>
      )}
    </Form>
  );
}

/** Shape of the Automation action extension: saved inputs live under `data`. */
type ActionConfigExtension = { data?: { inputs?: { ruleUuid?: string } } };

export function AutomationConfig() {
  const context = useProductContext();
  if (!context) return <Text>Loading configuration...</Text>;
  const { data } = context.extension as ActionConfigExtension;
  return <RuleForm ruleUuid={data?.inputs?.ruleUuid ?? ""} />;
}

ForgeReconciler.render(
  <React.StrictMode>
    <AutomationConfig />
  </React.StrictMode>,
);
