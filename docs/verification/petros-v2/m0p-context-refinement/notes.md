# Canvas selection and response refinement

- Diagram Ask control: 12px left/right padding, 6px icon gap; mobile Ask and Clear share the first row above editing controls.
- Empty canvas clicks clear node/card/edge selection and cancel pending connections. Clicks on elements and controls preserve their interaction; panning preserves selection. Blank-click focus moves to the canvas so keyboard movement cannot edit the previously selected node.
- Response prompts appear when the checkpoint is ready. The prompt scrolls above playback and focuses the required input once. Selection and subsequent edits do not repeat that focus.
- Context toolbar placement uses its rendered dimensions and visible canvas bounds, including sticky headings and playback.

Validation: 39 tests in six Petros V2 test files passed; student typecheck and scoped ESLint passed. Eight contained browser checks passed with zero runtime errors at 1440×900, 1440×600, 360×800, and 320×568. The browser accessed only disposable GET authentication metadata. No database writes or provider calls.

Changed application files: teaching-canvas.tsx, diagram-editor.tsx, teaching-canvas.module.css, companion-playground.tsx, and teaching-playground.spec.tsx.
