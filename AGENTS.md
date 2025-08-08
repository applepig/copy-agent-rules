## Project Development Guidelines (Sample)

### Zero Build, Zero Dependency
- Always write function in native vanilla JavaScript.
- LLM friendly, human readable.

### Coding Style
- Indentation: 2 spaces.
- Comment style: add brief “why” comments above complex logic.
- Naming:
  - Variables: snake_case (e.g., `let recommend_items = []`).
  - Functions: camelCase (e.g., `function getRecommendItem() {}`).
  - Global constants: UPPER_SNAKE (e.g., `WINDOW_POSITIONS`).
  - Local variables: snake_case; common words can be abbreviated (e.g., `win_pos`).

### Bug Fix Policy
- Default to the minimal-change principle unless otherwise specified.
- Propose refactors proactively when they improve clarity, safety, or maintainability.

### JavaScript
- Prefer: ES Modules, IIFE, Classes, getters/setters.
- Recommend: Data-driven design, EventBus patterns.
- Avoid: unnecessary CSS-in-JS.

### Unit Tests
- Keep tests zero-dependency when possible; place them under `/tests`.
- Prefer Node standard libraries to implement E2E tests for the CLI.


