
readme_content = r'''# StrategyFractal

**StrategyFractal** is a single-page, browser-based strategy mapping tool for building nested outlines of:

- **topics**
- **questions** (`Why`, `What`, `How`, `Who`, and custom prompts)
- **answers / subtopics**
- **sources**

It is designed to feel like a hybrid of a whiteboard, a sticky-note workspace, and a recursive strategy outline.

The current implementation is a **single `index.html` file** with no build step, making it easy to host with **GitHub Pages**.

---

## Concept

StrategyFractal is built around a simple recursive structure:

1. Start with a **topic** or idea.
2. Branch from that idea with questions like:
   - **Why**
   - **What**
   - **How**
   - **Who**
   - **Custom**
3. Add one or more **answers** to those questions.
4. Treat each answer like a new subtopic that can itself branch into more questions.
5. Optionally attach **sources** to any topic or answer.

This creates a fractal-style strategic outline: every answer can become the center of another layer of inquiry.

---

## Features

### Core editing
- Create top-level topics
- Select a topic and edit it directly in the board
- Add answers to the currently active branch
- Add custom question branches
- Delete branches, answers, or entire subtrees
- Duplicate a subtree as a new top-level topic

### Board-first interaction
- Large central card for the selected topic / answer
- Orbit-style question buttons for `Why`, `What`, `How`, `Who`, and `+ Custom`
- Active branch opens in a dock beneath the main card
- Drag-and-drop reordering for:
  - top-level topics
  - answer cards within a question branch

### Lazy-instantiated question branches
Default question types are shown visually, but they are **not added to the data model until used**.
This keeps the workspace, outline tree, and text export focused on only the branches that matter.

### Sources
- Add sources to any topic or answer
- Each source can include:
  - label
  - URL
  - note / citation context

### Persistence and portability
- Auto-save to **localStorage**
- Export the full board as **JSON**
- Import a previous session from **JSON**
- Export a nested outline as **plain text**
- Copy the outline to the clipboard

### Quality-of-life
- Undo / redo
- Search across item text, questions, and sources
- Theme switching:
  - Modern
  - Sticky Notes
  - Playful
  - Minimal
- Optional hide/show for the **Top-Level Topics** strip
- Optional hide/show for the outline sidebar

---

## How It Works

### Data model
At a high level, StrategyFractal uses a recursive tree-like model:

- **Item**
  - a topic or answer/subtopic
  - contains text, sources, and child question branches
- **Question**
  - belongs to one item
  - contains ordered answer items
- **Answer item**
  - is also an item
  - can contain its own question branches

This lets the app represent a nested reasoning structure like:

```text
Topic
└── Why?
    ├── Answer 1
    │   └── How?
    │       └── Answer 1.1
    └── Answer 2


Meaningful branch rendering
The outline tree and exported text only show populated branches.
A question branch becomes meaningful when it has at least one answer with content, sources, or meaningful descendants.


Deploying to GitHub Pages

Create a GitHub repository.
Add index.html and README.md to the root.
Push to GitHub.
In the repository settings, enable GitHub Pages.
Set the source to your default branch (usually main) and the root folder.
Open the published GitHub Pages URL.

Because StrategyFractal is a single static HTML file, it works well with GitHub Pages and requires no build pipeline.

Keyboard Shortcuts

N — new top-level topic
Q — add custom question to the selected card
A — add answer to the active question branch
Ctrl/Cmd + Z — undo
Ctrl/Cmd + Shift + Z — redo
Ctrl/Cmd + Y — redo (alternate)
Escape — close modal

Export Formats
JSON export
JSON export stores the full app state, including:

items
question branches
sources
UI state
history-related session structure where applicable

Use this to resume work later.
Text export
Text export generates a breadth-first-then-drill-down outline, showing:

grouped siblings first
then a deeper expansion of each item
sources inline beneath the relevant item

This makes it easier to review both the structure and the detail of a strategic thought process.

Intended Use Cases
StrategyFractal works well for:

strategy development
opportunity mapping
research framing
decision decomposition
operating model design
project planning
essay / argument scaffolding
workshop facilitation notes
personal thinking and reflection


Design Principles
This app is built around a few principles:

Direct manipulation over admin panels

interact with cards and branches in the board itself


Only show what is meaningful

unused branches should not clutter the tree or exports


Recursive strategy structure

every answer can become a new layer of inquiry


Portable and lightweight

no backend, no install, no build step


Readable exports

the work should be easy to carry into documents, notes, or presentations






Limitations / Current Scope
Current version is intentionally lightweight:

single-user only
local browser storage only
no real-time collaboration
no cloud sync
no authentication
no database backend
no cross-links between unrelated branches
no canvas pan/zoom yet


Possible Future Enhancements
Potential next steps include:

markdown export
subtree-only export / copy
collapse / expand source blocks
list vs sequence modes for answer groups
zoomable / pannable canvas
visual relationship lines
named local sessions
cross-links between branches
tags / labels
search result highlighting
import/export validation improvements
multi-board support


Development Notes
The current implementation is intentionally simple:

HTML for structure
CSS for layout, themes, and visual treatment
Vanilla JavaScript for state management, rendering, drag-and-drop, persistence, and export

No framework or bundler is required.
This makes it easy to:

inspect
modify
fork
host for free

