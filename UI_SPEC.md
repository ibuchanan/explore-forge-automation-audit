# UI Specification: Get Automation Rule

## 1. Strategy & Scope

- **User Goal:** Retrieve an Automation rule definition inside a rule and pass it
  to a subsequent Rovo agent step.
- **Posture:** Transient configuration.
- **Placement:** Automation rule builder, app action configuration panel.
- Preserve the existing Rovo Chat action and shared retrieval security checks.
- Expose an Automation action named **Get Automation rule** through an
  `automation:actionProvider`.
- Return the definition as a JSON string in a declared `definition` output.
  Fetching the definition does not itself invoke the Rovo agent.

## 2. Structure & Skeleton

- **Hero Element:** A single required, labeled **Rule UUID** text field.
- **Hierarchy:** Field, short helper text, inline validation error.
- **Interaction Flow:** Add action, select an administrator-owned connection,
  enter a UUID or smart-value expression, save with Automation's native Next
  button. A later Rovo agent step receives the definition output.
- Restore saved input when reopening the action. Submit changed configuration
  through Forge Bridge so Automation can persist it.
- No credential inputs, site selector, custom styling, or extra save button.

## 3. The State Matrix

- **Ideal:** Existing UUID or expression is shown and can be edited.
- **Empty:** Empty required field with guidance to use a rule UUID, not a numeric
  legacy ID.
- **Loading:** Display a native loading indication until configuration context
  is available.
- **Error:** Show required-field and configuration-save errors inline. At
  execution, retain UUID validation and the existing safe retrieval errors.

## 4. Edge Cases

- Permit smart-value expressions during configuration; validate the resolved UUID
  at execution.
- Long input remains contained in the native text field.
- The connection user must have Administer Jira permission and app consent.
- Read only from the trusted installation site. Do not bypass authorization for
  background Automation executions.
- Credentials stay in Forge variables; the separate API connection metadata is
  never included in the output.

## 5. Proposed Test Boundaries

- Existing public retrieval action: preserve all input, permission, site-binding,
  and credential-safety behavior.
- Automation entrypoint: return the retrieved definition in Automation's output
  contract and fail safely on retrieval errors.
- Configuration form/Forge Bridge: restore inputs, persist edits, and expose
  loading and validation/save error states.
