(function() {
const STORAGE_KEY = ‘strategyfractal-state-v2’;
const DEFAULT_QUESTIONS = [‘Why’, ‘What’, ‘How’, ‘Who’];
const THEMES = [‘modern’, ‘sticky’, ‘playful’, ‘minimal’];
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 2.0;
const COLUMN_WIDTH = 420;
const ROW_GAP = 24;
const NODE_W_TOPIC = 300;
const NODE_W_QUESTION = 340;

// ── Element references ────────────────────────────────────────────────────
// Helper: get by id, warn if missing (makes mobile wiring easier to debug)
function el(id) {
const node = document.getElementById(id);
if (!node) console.warn(`[SF] Missing element: #${id}`);
return node;
}

const els = {
workspace:              el(‘workspace’),
topTopicsPanel:         el(‘topTopicsPanel’),
rootLane:               el(‘rootLane’),
outlineTree:            el(‘outlineTree’),
outlineText:            el(‘outlineText’),
outlineViewText:        el(‘outlineViewText’),
selectionPill:          el(‘selectionPill’),
boardView:              el(‘boardView’),
outlineView:            el(‘outlineView’),
canvasWorld:            el(‘canvasWorld’),
connectionLayer:        el(‘connectionLayer’),
modalBackdrop:          el(‘modalBackdrop’),
modalTitle:             el(‘modalTitle’),
modalSubtitle:          el(‘modalSubtitle’),
modalTextarea:          el(‘modalTextarea’),
modalActions:           el(‘modalActions’),
closeModalBtn:          el(‘closeModalBtn’),

```
// Desktop toolbar
newRootBtn:             el('newRootBtn'),
addAnswerBtn:           el('addAnswerBtn'),
addQuestionBtn:         el('addQuestionBtn'),
toggleTopicsBtn:        el('toggleTopicsBtn'),
toggleSidebarBtn:       el('toggleSidebarBtn'),
collapseSidebarInnerBtn:el('collapseSidebarInnerBtn'),
boardViewBtn:           el('boardViewBtn'),
outlineViewBtn:         el('outlineViewBtn'),
themeSelect:            el('themeSelect'),
undoBtn:                el('undoBtn'),
redoBtn:                el('redoBtn'),
copyOutlineBtn:         el('copyOutlineBtn'),
exportJsonBtn:          el('exportJsonBtn'),
importJsonBtn:          el('importJsonBtn'),
clearBtn:               el('clearBtn'),
downloadTextBtn:        el('downloadTextBtn'),
examplesBtn:            el('examplesBtn'),
examplesDropdown:       el('examplesDropdown'),

// Search
searchToggleBtn:        el('searchToggleBtn'),
searchBar:              el('searchBar'),
searchInput:            el('searchInput'),
searchCloseBtn:         el('searchCloseBtn'),

// Mobile overflow drawer
overflowMenuBtn:        el('overflowMenuBtn'),
overflowDrawer:         el('overflowDrawer'),
closeOverflowBtn:       el('closeOverflowBtn'),
drawerScrim:            el('drawerScrim'),

// Mobile drawer mirror buttons
addQuestionBtnMobile:   el('addQuestionBtnMobile'),
boardViewBtnMobile:     el('boardViewBtnMobile'),
outlineViewBtnMobile:   el('outlineViewBtnMobile'),
toggleTopicsBtnMobile:  el('toggleTopicsBtnMobile'),
undoBtnMobile:          el('undoBtnMobile'),
redoBtnMobile:          el('redoBtnMobile'),
copyOutlineBtnMobile:   el('copyOutlineBtnMobile'),
exportJsonBtnMobile:    el('exportJsonBtnMobile'),
importJsonBtnMobile:    el('importJsonBtnMobile'),
clearBtnMobile:         el('clearBtnMobile'),
themeSelectMobile:      el('themeSelectMobile'),
examplesBtnMobile:      el('examplesBtnMobile'),
examplesDropdownMobile: el('examplesDropdownMobile'),

// Sidebar
sidebar:                el('sidebar'),
```

};

let state = loadState() || createInitialState();
let dragState = null;
let toastTimer = null;
let examplesManifest = null;
let isPanning = false;
let panStart = { x: 0, y: 0 };

// ── Touch pan/zoom state ──────────────────────────────────────────────────
let activeTouches = new Map();   // pointerId → {x, y}
let pinchStartDist = null;
let pinchStartScale = null;
let pinchStartPan = null;

// ── Initial state ─────────────────────────────────────────────────────────

function createInitialState() {
const s = {
version: 2,
settings: {
theme: ‘modern’,
mainView: ‘board’,
sidebarOpen: false,   // default closed on mobile; desktop CSS overrides visually
showTopTopics: true,
},
ui: {
selectedItemId: null,
activeQuestionId: null,
search: ‘’,
canvas: { panX: 60, panY: 60, scale: 1.0 },
},
roots: [],
entities: {
items: {},
questions: {},
},
history: {
past: [],
future: [],
},
meta: {
createdAt: Date.now(),
updatedAt: Date.now(),
lastSavedAt: Date.now(),
}
};
const first = createItemInternal(s, { kind: ‘topic’, text: ‘’ });
s.roots.push(first.id);
s.ui.selectedItemId = first.id;
return s;
}

// ── Entity creation ───────────────────────────────────────────────────────

function uid(prefix) {
return prefix + ‘-’ + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function createItemInternal(targetState, { kind = ‘answer’, text = ‘’, parentQuestionId = null } = {}) {
const id = uid(‘item’);
targetState.entities.items[id] = {
id, kind, text,
questionIds: [],
parentQuestionId,
sourceList: [],
nodeMode: ‘expanded’,
pos: { x: 0, y: 0 },
createdAt: Date.now(),
updatedAt: Date.now(),
};
if (parentQuestionId) {
const q = targetState.entities.questions[parentQuestionId];
if (q) q.answerIds.push(id);
}
return targetState.entities.items[id];
}

function createQuestionInternal(targetState, parentItemId, label = ‘’) {
const id = uid(‘q’);
targetState.entities.questions[id] = {
id, parentItemId, label,
answerIds: [],
pos: { x: 0, y: 0 },
createdAt: Date.now(),
updatedAt: Date.now(),
};
targetState.entities.items[parentItemId].questionIds.push(id);
return targetState.entities.questions[id];
}

// ── History / persistence ─────────────────────────────────────────────────

function deepClone(obj) {
return JSON.parse(JSON.stringify(obj));
}

function snapshotState() {
return deepClone({
settings: state.settings,
ui: state.ui,
roots: state.roots,
entities: state.entities,
meta: state.meta,
});
}

function pushHistory() {
state.history.past.push(snapshotState());
if (state.history.past.length > 80) state.history.past.shift();
state.history.future = [];
}

function restoreSnapshot(snapshot) {
state.settings = snapshot.settings;
state.ui = snapshot.ui;
state.roots = snapshot.roots;
state.entities = snapshot.entities;
state.meta = snapshot.meta || state.meta;
normalizeState();
render();
persist();
}

function normalizeState() {
if (!state.settings) state.settings = { theme: ‘modern’, mainView: ‘board’, sidebarOpen: false, showTopTopics: true };
if (typeof state.settings.showTopTopics !== ‘boolean’) state.settings.showTopTopics = true;
if (!state.ui) state.ui = { selectedItemId: null, activeQuestionId: null, search: ‘’, canvas: { panX: 60, panY: 60, scale: 1.0 } };
if (!state.ui.canvas) state.ui.canvas = { panX: 60, panY: 60, scale: 1.0 };
if (!state.history) state.history = { past: [], future: [] };
if (!state.entities) state.entities = { items: {}, questions: {} };
if (!Array.isArray(state.roots)) state.roots = [];

```
state.roots = state.roots.filter(id => state.entities.items[id]);
if (!state.roots.length) {
  const fallback = createItemInternal(state, { kind: 'topic', text: '' });
  state.roots.push(fallback.id);
}

Object.values(state.entities.items).forEach(item => {
  if (!Array.isArray(item.questionIds)) item.questionIds = [];
  if (!Array.isArray(item.sourceList)) item.sourceList = [];
  if (!item.nodeMode) item.nodeMode = 'collapsed';
  if (!item.pos) item.pos = { x: 0, y: 0 };
});
Object.values(state.entities.questions).forEach(q => {
  if (!Array.isArray(q.answerIds)) q.answerIds = [];
  if (!q.pos) q.pos = { x: 0, y: 0 };
});

if (!state.entities.items[state.ui.selectedItemId]) {
  state.ui.selectedItemId = state.roots[0] || null;
}
```

}

function undo() {
if (!state.history.past.length) return;
const current = snapshotState();
const prev = state.history.past.pop();
state.history.future.push(current);
restoreSnapshot(prev);
}

function redo() {
if (!state.history.future.length) return;
const current = snapshotState();
const next = state.history.future.pop();
state.history.past.push(current);
restoreSnapshot(next);
}

function persist() {
state.meta.updatedAt = Date.now();
state.meta.lastSavedAt = Date.now();
const payload = deepClone(state);
delete payload.history;
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
} catch (err) {
console.warn(‘Failed to save state:’, err);
}
}

function loadState() {
try {
const rawV2 = localStorage.getItem(STORAGE_KEY);
const rawV1 = localStorage.getItem(‘strategyfractal-state-v1’);
const raw = rawV2 || rawV1;
if (!raw) return null;
const parsed = JSON.parse(raw);
if (!parsed || typeof parsed !== ‘object’ || !parsed.entities || !parsed.roots) return null;
if (!parsed.history) parsed.history = { past: [], future: [] };
if (!parsed.settings) parsed.settings = { theme: ‘modern’, mainView: ‘board’, sidebarOpen: false, showTopTopics: true };
if (typeof parsed.settings.showTopTopics !== ‘boolean’) parsed.settings.showTopTopics = true;
if (!parsed.ui) parsed.ui = { selectedItemId: parsed.roots[0] || null, activeQuestionId: null, search: ‘’, canvas: { panX: 60, panY: 60, scale: 1.0 } };
if (!parsed.ui.canvas) parsed.ui.canvas = { panX: 60, panY: 60, scale: 1.0 };
return parsed;
} catch (err) {
console.warn(‘Failed to load state:’, err);
return null;
}
}

// ── State helpers ─────────────────────────────────────────────────────────

function normalizeLabel(label) {
return (label || ‘’).trim().toLowerCase();
}

function colorClassForLabel(label) {
const value = normalizeLabel(label);
if (!value) return ‘blank’;
if (value === ‘why’)  return ‘why’;
if (value === ‘what’) return ‘what’;
if (value === ‘how’)  return ‘how’;
if (value === ‘who’)  return ‘who’;
return ‘custom’;
}

function itemLabel(item) {
const text = (item?.text || ‘’).trim();
return text || (item?.kind === ‘topic’ ? ‘Untitled topic’ : ‘Untitled answer’);
}

function getSelectedItem() {
return state.entities.items[state.ui.selectedItemId] || null;
}

function findQuestionByLabel(parentItemId, label) {
const item = state.entities.items[parentItemId];
if (!item) return null;
const target = normalizeLabel(label);
return item.questionIds
.map(id => state.entities.questions[id])
.find(q => normalizeLabel(q?.label) === target) || null;
}

function setFocusedNode(itemId) {
state.ui.selectedItemId = itemId;
persist();
renderRootLane();
renderOutlineTree();
renderOutlineText();
updateButtons();
}

function setExpandedNode(itemId, mode) {
const item = state.entities.items[itemId];
if (!item) return;
item.nodeMode = mode;
persist();
renderCanvas();
}

// ── Meaningful-content helpers ────────────────────────────────────────────

function filterMatchesItem(item) {
const query = (state.ui.search || ‘’).trim().toLowerCase();
if (!query) return true;
const inText      = (item.text || ‘’).toLowerCase().includes(query);
const inSources   = item.sourceList.some(src => [src.label, src.url, src.note].join(’ ’).toLowerCase().includes(query));
const inQuestions = item.questionIds.some(qId => (state.entities.questions[qId]?.label || ‘’).toLowerCase().includes(query));
return inText || inSources || inQuestions;
}

function hasDirectItemContent(item) {
if (!item) return false;
return Boolean((item.text || ‘’).trim()) ||
item.sourceList.some(src => Boolean((src.label || ‘’).trim() || (src.url || ‘’).trim() || (src.note || ‘’).trim()));
}

function isItemMeaningful(item) {
if (!item) return false;
if (hasDirectItemContent(item)) return true;
return item.questionIds.some(qid => isQuestionMeaningful(state.entities.questions[qid]));
}

function isQuestionMeaningful(question) {
if (!question) return false;
return question.answerIds.map(id => state.entities.items[id]).filter(Boolean).some(a => isItemMeaningful(a));
}

function meaningfulQuestionsForItem(item) {
return item.questionIds
.map(id => state.entities.questions[id])
.filter(q => q && isQuestionMeaningful(q));
}

function meaningfulAnswersForQuestion(question) {
return question.answerIds
.map(id => state.entities.items[id])
.filter(answer => answer && isItemMeaningful(answer));
}

function countMeaningfulDescendants(itemId) {
const item = state.entities.items[itemId];
if (!item) return 0;
let count = 0;
item.questionIds.forEach(qid => {
const q = state.entities.questions[qid];
if (!q) return;
q.answerIds.forEach(ansId => {
const answer = state.entities.items[ansId];
if (answer && isItemMeaningful(answer)) {
count += 1 + countMeaningfulDescendants(ansId);
}
});
});
return count;
}

function countInstantiatedQuestions(item) {
return item.questionIds.filter(qid => state.entities.questions[qid]).length;
}

// ── Layout engine ─────────────────────────────────────────────────────────

function estimateItemHeight(item) {
if (!item) return 52;
if (item.nodeMode === ‘collapsed’) return 44;
return 220 + item.sourceList.length * 64;
}

function estimateQuestionHeight(question) {
if (!question) return 52;
return 96 + Math.max(1, question.answerIds.length) * 64;
}

function computeLayout() {
const layout = new Map();
let rootY = 60;
state.roots.forEach(rootId => {
const item = state.entities.items[rootId];
if (!item) return;
const h = estimateItemHeight(item);
layout.set(rootId, { x: 60, y: rootY, w: NODE_W_TOPIC, h });
const subtreeH = layoutSubtree(rootId, 0, rootY, layout);
rootY += Math.max(h, subtreeH) + ROW_GAP * 2;
});
return layout;
}

function layoutSubtree(itemId, depth, startY, layout) {
const item = state.entities.items[itemId];
if (!item || !item.questionIds.length) return 0;
const parentPos = layout.get(itemId);
if (!parentPos) return 0;

```
let qY = startY;
let totalH = 0;
item.questionIds.forEach(questionId => {
  const q = state.entities.questions[questionId];
  if (!q) return;
  const qH = estimateQuestionHeight(q);
  const qX = parentPos.x + parentPos.w + COLUMN_WIDTH;
  layout.set(questionId, { x: qX, y: qY, w: NODE_W_QUESTION, h: qH });
  let childY = qY;
  q.answerIds.forEach(answerId => {
    const answer = state.entities.items[answerId];
    if (!answer) return;
    layout.set(answerId, { x: qX, y: childY, w: NODE_W_QUESTION, h: 0, inline: true });
    childY += layoutSubtree(answerId, depth + 1, childY, layout);
  });
  qY += qH + ROW_GAP;
  totalH += qH + ROW_GAP;
});
return totalH;
```

}

// ── Canvas rendering ──────────────────────────────────────────────────────

function renderCanvas() {
if (state.settings.mainView !== ‘board’) return;
const layout = computeLayout();
syncCanvasNodes(layout);
renderConnections(layout);
applyTransform();
updateFidelityClass();
}

function syncCanvasNodes(layout) {
Array.from(els.canvasWorld.querySelectorAll(’[data-node-id]’)).forEach(nodeEl => {
if (!layout.has(nodeEl.dataset.nodeId)) nodeEl.remove();
});

```
layout.forEach((pos, id) => {
  if (pos.inline) return;
  const isItem     = Boolean(state.entities.items[id]);
  const isQuestion = Boolean(state.entities.questions[id]);
  if (!isItem && !isQuestion) return;

  let nodeEl = els.canvasWorld.querySelector(`[data-node-id="${id}"]`);
  if (!nodeEl) {
    nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.dataset.nodeId = id;
    els.canvasWorld.appendChild(nodeEl);
  } else {
    const fresh = nodeEl.cloneNode(false);
    nodeEl.replaceWith(fresh);
    nodeEl = fresh;
  }

  nodeEl.style.left  = pos.x + 'px';
  nodeEl.style.top   = pos.y + 'px';
  nodeEl.style.width = pos.w + 'px';

  if (isItem) renderItemNode(nodeEl, state.entities.items[id]);
  else        renderQuestionNode(nodeEl, state.entities.questions[id]);
});
```

}

function renderItemNode(nodeEl, item) {
const isSelected = state.ui.selectedItemId === item.id;
const isExpanded = item.nodeMode === ‘expanded’;
const chipActive = isSelected ? ‘is-active’ : ‘’;

```
if (!isExpanded) {
  nodeEl.innerHTML = `
    <div class="node-dot" style="background:#94a3b8;"></div>
    <div class="node-topic-chip ${chipActive}" data-action="expand">
      <span>${escapeHtml(itemLabel(item))}</span>
    </div>`;
} else {
  const spawnBtns = DEFAULT_QUESTIONS.map(label => {
    const exists = findQuestionByLabel(item.id, label);
    const cls = colorClassForLabel(label);
    return `<button type="button" class="spawn-btn ${cls}${exists ? ' already-exists' : ''}" data-spawn="${escapeHtml(label)}" title="${exists ? 'Already exists' : 'Add ' + label + ' branch'}">${escapeHtml(label)}</button>`;
  }).join('');

  nodeEl.innerHTML = `
    <div class="node-dot" style="background:#94a3b8;"></div>
    <div class="node-topic-card ${chipActive}">
      <div class="node-card-header">
        <span class="chip blank" style="font-size:0.78rem;">Topic</span>
        <div class="node-chrome" style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="btn btn-soft" style="padding:5px 10px;font-size:0.78rem;" data-action="collapse">Collapse</button>
          <button type="button" class="btn btn-soft" style="padding:5px 10px;font-size:0.78rem;" data-action="delete-item">Delete</button>
        </div>
      </div>
      <div class="node-card-body">
        <div class="node-text-area" contenteditable="true" spellcheck="true" data-item-text="${item.id}"></div>
        <div class="node-question-buttons">
          ${spawnBtns}
          <button type="button" class="spawn-btn custom" data-spawn-custom="1">+ Custom</button>
        </div>
        <div class="inline-sources" data-source-mount="${item.id}">${buildSourceEditorHtml(item)}</div>
        <div class="node-chrome" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn btn-soft" style="padding:5px 10px;font-size:0.78rem;" data-action="add-source">+ Source</button>
        </div>
      </div>
    </div>`;

  const textEl = nodeEl.querySelector(`[data-item-text="${item.id}"]`);
  setEditableContent(textEl, item.text, 'What\'s the topic?');
  attachEditable(textEl, value => updateItemText(item.id, value), pushHistoryOnce);
}

nodeEl.onclick = e => handleItemNodeClick(e, item);
wireSourceListeners(nodeEl, item);
```

}

function renderQuestionNode(nodeEl, question) {
const cc = colorClassForLabel(question.label);
const isActive  = state.ui.activeQuestionId === question.id;
const dotColors = { why: ‘#ef476f’, what: ‘#118ab2’, how: ‘#06d6a0’, who: ‘#f4a261’, custom: ‘#8f7cf6’, blank: ‘#94a3b8’ };
const dotColor  = dotColors[cc] || ‘#94a3b8’;

```
const answersHtml = question.answerIds.map((answerId, bulletIndex) => {
  const answer = state.entities.items[answerId];
  if (!answer) return '';
  const childSpawnBtns = DEFAULT_QUESTIONS.map(label => {
    const exists = findQuestionByLabel(answerId, label);
    const bcls = colorClassForLabel(label);
    return `<button type="button" class="branch-spawn-btn ${bcls}${exists ? ' already-exists' : ''}" data-child-spawn="${escapeHtml(label)}" data-answer-id="${answerId}">${escapeHtml(label)} →</button>`;
  }).join('');
  return `
    <div class="answer-bullet" data-bullet-index="${bulletIndex}">
      <div class="answer-bullet-row">
        <div class="bullet-marker"></div>
        <div class="answer-text-field" contenteditable="true" spellcheck="true" data-item-text="${answer.id}"></div>
      </div>
      <div class="answer-bullet-actions node-chrome">
        ${childSpawnBtns}
        <button type="button" class="branch-spawn-btn custom" data-child-spawn-custom="1" data-answer-id="${answerId}">Custom →</button>
        <button type="button" class="branch-spawn-btn" style="color:var(--muted);" data-delete-answer="${answerId}">✕</button>
      </div>
    </div>`;
}).join('');

const singleAnswer = question.answerIds.length === 1 ? state.entities.items[question.answerIds[0]] : null;
const canSplit = singleAnswer && (singleAnswer.text || '').includes('\n') &&
                 singleAnswer.text.split('\n').filter(l => l.trim()).length > 1;

nodeEl.innerHTML = `
  <div class="node-dot" style="background:${dotColor};"></div>
  <div class="node-question-card ${isActive ? 'is-active' : ''}">
    <div class="node-q-header">
      <div class="node-q-label" contenteditable="true" spellcheck="false" data-question-label="${question.id}"></div>
      <div class="node-chrome" style="display:flex;gap:4px;flex-shrink:0;">
        <button type="button" class="btn btn-soft" style="padding:4px 8px;font-size:0.75rem;" data-action="delete-question">✕</button>
      </div>
    </div>
    <div class="node-q-body">
      ${answersHtml || '<div class="branch-empty" style="font-size:0.84rem;">No answers yet.</div>'}
    </div>
    <div class="node-q-footer node-chrome">
      <button type="button" class="btn btn-soft" style="padding:5px 10px;font-size:0.78rem;" data-action="add-answer">+ Answer</button>
      ${canSplit ? `<button type="button" class="btn btn-soft split-btn" data-action="split-bullets">Split into bullets</button>` : ''}
    </div>
  </div>`;

const labelEl = nodeEl.querySelector(`[data-question-label="${question.id}"]`);
if (labelEl) {
  setEditableContent(labelEl, question.label, 'Question…');
  attachEditable(labelEl, value => updateQuestionLabel(question.id, value), pushHistoryOnce);
}

question.answerIds.forEach(answerId => {
  const answer = state.entities.items[answerId];
  if (!answer) return;
  const textEl = nodeEl.querySelector(`[data-item-text="${answer.id}"]`);
  if (textEl) {
    setEditableContent(textEl, answer.text, 'Write an answer…');
    attachEditable(textEl, value => updateItemText(answerId, value), pushHistoryOnce);
  }
});

nodeEl.onclick = e => handleQuestionNodeClick(e, question);
```

}

function handleItemNodeClick(e, item) {
const action      = e.target.closest(’[data-action]’)?.dataset?.action;
const spawnLabel  = e.target.closest(’[data-spawn]’)?.dataset?.spawn;
const spawnCustom = e.target.closest(’[data-spawn-custom]’);

```
if (action === 'collapse')     { e.stopPropagation(); setExpandedNode(item.id, 'collapsed'); return; }
if (action === 'delete-item')  { e.stopPropagation(); deleteItem(item.id); return; }
if (action === 'add-source')   { e.stopPropagation(); addSource(item.id); return; }
if (spawnLabel)                { e.stopPropagation(); spawnQuestion(item.id, spawnLabel); return; }
if (spawnCustom)               { e.stopPropagation(); addCustomQuestion(item.id, ''); return; }
if (e.target.closest('[data-action="delete-source"]')) {
  e.stopPropagation();
  const sourceId = e.target.closest('[data-source-id]')?.dataset?.sourceId;
  if (sourceId) deleteSource(item.id, sourceId);
  return;
}
if (!e.target.closest('[contenteditable], input, button')) {
  setFocusedNode(item.id);
  if (item.nodeMode !== 'expanded') setExpandedNode(item.id, 'expanded');
}
```

}

function handleQuestionNodeClick(e, question) {
const action         = e.target.closest(’[data-action]’)?.dataset?.action;
const childSpawn     = e.target.closest(’[data-child-spawn]’)?.dataset?.childSpawn;
const childSpawnCust = e.target.closest(’[data-child-spawn-custom]’);
const deleteAnsId    = e.target.closest(’[data-delete-answer]’)?.dataset?.deleteAnswer;

```
if (action === 'delete-question') { e.stopPropagation(); deleteQuestion(question.id); return; }
if (action === 'add-answer')      { e.stopPropagation(); addAnswerToQuestion(question.id); return; }
if (action === 'split-bullets')   { e.stopPropagation(); splitAnswerIntoBullets(question.id); return; }
if (childSpawn) {
  e.stopPropagation();
  const answerId = e.target.closest('[data-answer-id]')?.dataset?.answerId;
  if (answerId) spawnQuestion(answerId, childSpawn);
  return;
}
if (childSpawnCust) {
  e.stopPropagation();
  const answerId = e.target.closest('[data-answer-id]')?.dataset?.answerId;
  if (answerId) addCustomQuestion(answerId, '');
  return;
}
if (deleteAnsId) { e.stopPropagation(); deleteItem(deleteAnsId); return; }
if (!e.target.closest('[contenteditable], input, button')) {
  state.ui.activeQuestionId = question.id;
  setFocusedNode(question.parentItemId);
  persist();
  renderCanvas();
}
```

}

// ── SVG connection lines ──────────────────────────────────────────────────

function renderConnections(layout) {
els.connectionLayer.innerHTML = ‘’;
Object.values(state.entities.questions).forEach(question => {
const parentPos = layout.get(question.parentItemId);
const qPos      = layout.get(question.id);
if (!parentPos || !qPos) return;

```
  const x1 = parentPos.x + parentPos.w;
  const y1 = parentPos.y + 44;
  const x2 = qPos.x;
  const y2 = qPos.y + 44;
  const mx = Math.max(40, (x2 - x1) * 0.5);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${x1},${y1} C ${x1+mx},${y1} ${x2-mx},${y2} ${x2},${y2}`);
  path.setAttribute('class', `connection-path ${colorClassForLabel(question.label)}`);
  els.connectionLayer.appendChild(path);
});
```

}

// ── Pan / zoom ────────────────────────────────────────────────────────────

function applyTransform() {
const { panX, panY, scale } = state.ui.canvas;
const t = `translate(${panX}px, ${panY}px) scale(${scale})`;
els.canvasWorld.style.transform = t;
els.connectionLayer.style.transform = t;
els.connectionLayer.style.transformOrigin = ‘0 0’;
}

function updateFidelityClass() {
const scale = state.ui.canvas.scale;
els.canvasWorld.classList.remove(‘fidelity-full’, ‘fidelity-medium’, ‘fidelity-abstract’);
if (scale >= 0.6)      els.canvasWorld.classList.add(‘fidelity-full’);
else if (scale >= 0.3) els.canvasWorld.classList.add(‘fidelity-medium’);
else                   els.canvasWorld.classList.add(‘fidelity-abstract’);
}

function setCanvasTransform(panX, panY, scale) {
state.ui.canvas.panX  = panX;
state.ui.canvas.panY  = panY;
state.ui.canvas.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
applyTransform();
updateFidelityClass();
persist();
}

function handleWheel(e) {
e.preventDefault();
const rect        = els.boardView.getBoundingClientRect();
const mouseX      = e.clientX - rect.left;
const mouseY      = e.clientY - rect.top;
const zoomFactor  = e.deltaY < 0 ? 1.1 : 0.909;
const { panX, panY, scale } = state.ui.canvas;
const newScale    = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale * zoomFactor));
const actualFactor = newScale / scale;
setCanvasTransform(
mouseX - (mouseX - panX) * actualFactor,
mouseY - (mouseY - panY) * actualFactor,
newScale
);
}

function dist2d(ax, ay, bx, by) {
return Math.hypot(bx - ax, by - ay);
}

function initPanEvents() {
// ── Mouse (desktop) ──────────────────────────
els.boardView.addEventListener(‘wheel’, handleWheel, { passive: false });

```
els.boardView.addEventListener('mousedown', e => {
  if (e.target.closest('[data-node-id], button, [contenteditable], input, select')) return;
  isPanning = true;
  panStart = { x: e.clientX - state.ui.canvas.panX, y: e.clientY - state.ui.canvas.panY };
  els.boardView.classList.add('is-panning');
});

window.addEventListener('mousemove', e => {
  if (!isPanning) return;
  state.ui.canvas.panX = e.clientX - panStart.x;
  state.ui.canvas.panY = e.clientY - panStart.y;
  applyTransform();
});

window.addEventListener('mouseup', () => {
  if (!isPanning) return;
  isPanning = false;
  els.boardView.classList.remove('is-panning');
  persist();
});

// ── Touch / Pointer (mobile) ─────────────────
// Use Pointer Events so mouse and touch share one path.
// touch-action:none on .canvas-viewport in CSS lets us own all gestures.

els.boardView.addEventListener('pointerdown', e => {
  // Ignore if touching a node's interactive element
  if (e.target.closest('[data-node-id], button, [contenteditable], input, select')) return;
  els.boardView.setPointerCapture(e.pointerId);
  activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activeTouches.size === 1) {
    // Single-finger pan: record start
    panStart = { x: e.clientX - state.ui.canvas.panX, y: e.clientY - state.ui.canvas.panY };
  } else if (activeTouches.size === 2) {
    // Two-finger pinch: snapshot distance and current scale
    const pts = [...activeTouches.values()];
    pinchStartDist  = dist2d(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    pinchStartScale = state.ui.canvas.scale;
    pinchStartPan   = { x: state.ui.canvas.panX, y: state.ui.canvas.panY };
  }
});

els.boardView.addEventListener('pointermove', e => {
  if (!activeTouches.has(e.pointerId)) return;
  activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activeTouches.size === 1) {
    // Pan
    state.ui.canvas.panX = e.clientX - panStart.x;
    state.ui.canvas.panY = e.clientY - panStart.y;
    applyTransform();
  } else if (activeTouches.size === 2) {
    // Pinch-zoom + simultaneous pan
    const pts     = [...activeTouches.values()];
    const newDist = dist2d(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    const factor  = newDist / pinchStartDist;
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartScale * factor));

    // Zoom toward midpoint of the two fingers
    const rect   = els.boardView.getBoundingClientRect();
    const midX   = (pts[0].x + pts[1].x) / 2 - rect.left;
    const midY   = (pts[0].y + pts[1].y) / 2 - rect.top;
    const actualFactor = newScale / pinchStartScale;

    state.ui.canvas.panX  = midX - (midX - pinchStartPan.x) * actualFactor;
    state.ui.canvas.panY  = midY - (midY - pinchStartPan.y) * actualFactor;
    state.ui.canvas.scale = newScale;
    applyTransform();
    updateFidelityClass();
  }
});

const endPointer = e => {
  activeTouches.delete(e.pointerId);
  if (activeTouches.size < 2) {
    pinchStartDist = null;
    // Re-anchor single-finger pan from current position
    if (activeTouches.size === 1) {
      const [pt] = activeTouches.values();
      panStart = { x: pt.x - state.ui.canvas.panX, y: pt.y - state.ui.canvas.panY };
    }
  }
  if (activeTouches.size === 0) persist();
};

els.boardView.addEventListener('pointerup',     endPointer);
els.boardView.addEventListener('pointercancel', endPointer);
```

}

function zoomToNode(nodeId) {
const layout = computeLayout();
const pos = layout.get(nodeId);
if (!pos) return;
const vw = els.boardView.offsetWidth;
const vh = els.boardView.offsetHeight;
const targetScale = 1.0;
const panX = vw / 2 - (pos.x + pos.w / 2) * targetScale;
const panY = vh / 2 - (pos.y + (pos.h || 80) / 2) * targetScale;
setCanvasTransform(panX, panY, targetScale);
renderCanvas();
}

// ── Node mutation helpers ─────────────────────────────────────────────────

function addRoot() {
pushHistory();
const item = createItemInternal(state, { kind: ‘topic’, text: ‘’ });
item.nodeMode = ‘expanded’;
state.roots.push(item.id);
state.ui.selectedItemId = item.id;
persist();
render();
requestAnimationFrame(() => focusEditable(`[data-item-text="${item.id}"]`));
}

function spawnQuestion(parentItemId, label) {
const item = state.entities.items[parentItemId];
if (!item) return;
const existing = findQuestionByLabel(parentItemId, label);
if (existing) {
state.ui.activeQuestionId = existing.id;
persist();
renderCanvas();
return;
}
pushHistory();
const q = createQuestionInternal(state, parentItemId, label);
createItemInternal(state, { kind: ‘answer’, text: ‘’, parentQuestionId: q.id });
state.ui.activeQuestionId = q.id;
persist();
render();
requestAnimationFrame(() => {
const answerEl = document.querySelector(`[data-node-id="${q.id}"] [data-item-text]`);
if (answerEl) answerEl.focus();
});
}

function addCustomQuestion(parentItemId, label) {
const item = state.entities.items[parentItemId];
if (!item) return;
if (!label) {
openModal({
title: ‘New Custom Question’,
subtitle: ‘Name this custom question branch.’,
initialValue: ‘Custom’,
actions: [
{ label: ‘Add’, primary: true, onClick: value => { closeModal(); _commitAddCustomQuestion(parentItemId, (value || ‘’).trim() || ‘Custom’); } },
{ label: ‘Cancel’, onClick: closeModal },
],
});
return;
}
_commitAddCustomQuestion(parentItemId, (label || ‘’).trim() || ‘Custom’);
}

function _commitAddCustomQuestion(parentItemId, chosen) {
pushHistory();
const q = createQuestionInternal(state, parentItemId, chosen);
createItemInternal(state, { kind: ‘answer’, text: ‘’, parentQuestionId: q.id });
state.ui.activeQuestionId = q.id;
persist();
render();
}

function addAnswerToQuestion(questionId) {
const q = state.entities.questions[questionId];
if (!q) return;
pushHistory();
const item = createItemInternal(state, { kind: ‘answer’, text: ‘’, parentQuestionId: questionId });
state.ui.activeQuestionId = questionId;
persist();
renderCanvas();
requestAnimationFrame(() => focusEditable(`[data-node-id="${questionId}"] [data-item-text="${item.id}"]`));
}

function splitAnswerIntoBullets(questionId) {
const q = state.entities.questions[questionId];
if (!q || q.answerIds.length !== 1) return;
const source = state.entities.items[q.answerIds[0]];
if (!source) return;
const lines = (source.text || ‘’).split(’\n’).map(l => l.trim()).filter(Boolean);
if (lines.length < 2) return;
pushHistory();
deleteItemRecursive(source.id);
q.answerIds = q.answerIds.filter(id => id !== source.id);
lines.forEach(line => createItemInternal(state, { kind: ‘answer’, text: line, parentQuestionId: questionId }));
persist();
render();
}

function focusEditable(selector) {
const el = document.querySelector(selector);
if (!el) return;
el.focus();
const range = document.createRange();
range.selectNodeContents(el);
range.collapse(false);
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);
}

function updateItemText(itemId, text) {
const item = state.entities.items[itemId];
if (!item) return;
item.text = text;
item.updatedAt = Date.now();
persist();
renderRootLane();
renderOutlineTree();
renderOutlineText();
updateButtons();
}

function updateQuestionLabel(questionId, label) {
const q = state.entities.questions[questionId];
if (!q) return;
q.label = label;
q.updatedAt = Date.now();
persist();
renderOutlineTree();
renderOutlineText();
renderConnections(computeLayout());
}

function deleteQuestion(questionId) {
const q = state.entities.questions[questionId];
if (!q) return;
openConfirm(‘Delete Question Branch’, ‘This will delete the question and all nested answers beneath it.’, () => {
pushHistory();
const parentItemId = q.parentItemId;
deleteQuestionRecursive(questionId);
const parentItem = state.entities.items[parentItemId];
if (parentItem) parentItem.questionIds = parentItem.questionIds.filter(id => id !== questionId);
if (state.ui.activeQuestionId === questionId) state.ui.activeQuestionId = null;
persist();
render();
});
}

function deleteQuestionRecursive(questionId) {
const q = state.entities.questions[questionId];
if (!q) return;
q.answerIds.slice().forEach(id => deleteItemRecursive(id));
delete state.entities.questions[questionId];
}

function deleteItemRecursive(itemId) {
const item = state.entities.items[itemId];
if (!item) return;
item.questionIds.slice().forEach(qid => deleteQuestionRecursive(qid));
if (item.parentQuestionId) {
const pq = state.entities.questions[item.parentQuestionId];
if (pq) pq.answerIds = pq.answerIds.filter(id => id !== itemId);
}
state.roots = state.roots.filter(id => id !== itemId);
if (state.ui.selectedItemId === itemId) {
state.ui.selectedItemId = state.roots[0] || null;
state.ui.activeQuestionId = null;
}
delete state.entities.items[itemId];
}

function deleteItem(itemId) {
const item = state.entities.items[itemId];
if (!item) return;
openConfirm(‘Delete Card’, ‘This will delete the card and all nested branches beneath it.’, () => {
pushHistory();
deleteItemRecursive(itemId);
normalizeState();
persist();
render();
});
}

function addSource(itemId) {
const item = state.entities.items[itemId];
if (!item) return;
pushHistory();
item.sourceList.push({ id: uid(‘src’), label: ‘’, url: ‘’, note: ‘’ });
persist();
renderCanvas();
}

function updateSource(itemId, sourceId, key, value) {
const item = state.entities.items[itemId];
if (!item) return;
const source = item.sourceList.find(s => s.id === sourceId);
if (!source) return;
source[key] = value;
item.updatedAt = Date.now();
persist();
}

function deleteSource(itemId, sourceId) {
const item = state.entities.items[itemId];
if (!item) return;
pushHistory();
item.sourceList = item.sourceList.filter(s => s.id !== sourceId);
persist();
renderCanvas();
}

// ── Source editor HTML builder ────────────────────────────────────────────

function buildSourceEditorHtml(item) {
if (!item.sourceList.length) return ‘’;
return item.sourceList.map(src => {
const safeUrl = /^https?:///i.test(src.url || ‘’) ? src.url : null;
return `<div class="source-grid" data-source-id="${src.id}"> <div class="source-row"> <input type="text" data-key="label" value="${escapeAttr(src.label || '')}" placeholder="Source label" /> <input type="url"  data-key="url"   value="${escapeAttr(src.url   || '')}" placeholder="https://…" /> <input type="text" data-key="note"  class="source-note" value="${escapeAttr(src.note || '')}" placeholder="Optional note" /> </div> <div class="sort-row"> <div class="sort-left"> ${safeUrl ?`<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="pill">Open ↗</a>` : ''} </div> <div class="sort-right"> <button type="button" class="btn btn-soft" data-action="delete-source" style="padding:5px 10px;font-size:0.78rem;">Delete</button> </div> </div> </div>`;
}).join(’’);
}

function wireSourceListeners(nodeEl, item) {
const mount = nodeEl.querySelector(`[data-source-mount="${item.id}"]`);
if (!mount) return;
mount.querySelectorAll(‘input’).forEach(input => {
input.addEventListener(‘focus’, pushHistoryOnce);
input.addEventListener(‘input’, e => updateSource(item.id, input.closest(’[data-source-id]’)?.dataset?.sourceId, e.target.dataset.key, e.target.value));
});
}

// ── Root lane (topic strip) ───────────────────────────────────────────────

function renderRootLane() {
els.rootLane.innerHTML = ‘’;
if (!state.roots.length) {
els.rootLane.innerHTML = ‘<div class="empty-state">No topics yet. Tap <strong>+ New Topic</strong> to start.</div>’;
return;
}
let visibleCount = 0;
state.roots.forEach((itemId, index) => {
const item = state.entities.items[itemId];
if (!item || !filterMatchesItem(item)) return;
visibleCount++;
const branchCount   = countMeaningfulDescendants(itemId);
const liveQuestions = countInstantiatedQuestions(item);
const card = document.createElement(‘div’);
card.className = ‘root-chip’ + (state.ui.selectedItemId === itemId ? ’ active’ : ‘’);
card.draggable = true;
card.dataset.dragType = ‘roots’;
card.dataset.id = itemId;
card.innerHTML = ` <div class="sort-row"> <div class="sort-left"> <div class="drag" title="Drag to reorder">⋮⋮</div> <div class="root-chip-label" contenteditable="true" data-item-text="${item.id}"></div> </div> <small>#${index + 1}</small> </div> <small>${liveQuestions} branch${liveQuestions === 1 ? '' : 'es'} · ${branchCount} descendant${branchCount === 1 ? '' : 's'}</small>`;

```
  card.addEventListener('click', e => {
    if (e.target.closest('[data-item-text]')) return;
    setFocusedNode(itemId);
    zoomToNode(itemId);
  });
  wireDragAndDrop(card, state.roots, itemId, () => render());
  els.rootLane.appendChild(card);

  const labelEl = card.querySelector(`[data-item-text="${item.id}"]`);
  setEditableContent(labelEl, item.text, 'Untitled topic');
  labelEl.addEventListener('mousedown', e => e.stopPropagation());
  labelEl.addEventListener('focus', () => {
    pushHistoryOnce();
    if (state.ui.selectedItemId !== itemId) {
      state.ui.selectedItemId = itemId;
      document.querySelectorAll('.root-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.id === itemId));
      persist();
    }
    if (labelEl.dataset.empty === 'true') labelEl.textContent = '';
  });
  labelEl.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') labelEl.blur(); });
  labelEl.addEventListener('blur', () => updateItemText(itemId, getEditableText(labelEl)));
  labelEl.addEventListener('input', () => toggleEditablePlaceholder(labelEl));
});
if (!visibleCount) {
  els.rootLane.innerHTML = '<div class="empty-state">No matches for the current search.</div>';
}
```

}

// ── Outline tree ──────────────────────────────────────────────────────────

function renderOutlineTree() {
els.outlineTree.innerHTML = ‘’;
if (!state.roots.length) {
els.outlineTree.innerHTML = ‘<div class="empty-state">Nothing on the board yet.</div>’;
return;
}
const frag = document.createDocumentFragment();
state.roots.forEach(rootId => {
const item = state.entities.items[rootId];
if (!item || !filterMatchesItem(item)) return;
frag.appendChild(renderOutlineItem(item));
});
if (!frag.childNodes.length) {
els.outlineTree.innerHTML = ‘<div class="empty-state">No matches for the current search.</div>’;
} else {
els.outlineTree.appendChild(frag);
}
}

function renderOutlineItem(item) {
const wrapper = document.createElement(‘div’);
wrapper.className = ‘outline-node’;
const row = document.createElement(‘div’);
row.className = ‘outline-item-row’;
row.innerHTML = `<button class="outline-select ${state.ui.selectedItemId === item.id ? 'active' : ''}">${escapeHtml(itemLabel(item))}</button> <span class="pill">${item.kind}</span> ${item.parentQuestionId ?`<span class="pill">via ${escapeHtml(state.entities.questions[item.parentQuestionId]?.label || ‘question’)}</span>` : '<span class="pill">top-level</span>'}`;
row.querySelector(’.outline-select’).addEventListener(‘click’, () => {
setFocusedNode(item.id);
zoomToNode(item.id);
closeSidebarOnMobile();
});
wrapper.appendChild(row);
meaningfulQuestionsForItem(item).forEach(q => {
const qNode = document.createElement(‘div’);
qNode.className = ‘outline-node’;
const cc = colorClassForLabel(q.label);
qNode.innerHTML = ` <div class="outline-question-row"> <button class="outline-select ${state.ui.activeQuestionId === q.id ? 'active' : ''}">? ${escapeHtml(q.label || 'Blank')}</button> <span class="chip ${cc}">${escapeHtml(q.label || 'Blank')}</span> <span class="pill">${meaningfulAnswersForQuestion(q).length}</span> </div>`;
qNode.querySelector(’.outline-select’).addEventListener(‘click’, () => {
state.ui.activeQuestionId = q.id;
setFocusedNode(item.id);
zoomToNode(q.id);
persist();
closeSidebarOnMobile();
});
meaningfulAnswersForQuestion(q).forEach(answer => qNode.appendChild(renderOutlineItem(answer)));
wrapper.appendChild(qNode);
});
return wrapper;
}

function renderOutlineText() {
const text = generateBreadthThenDrillOutline();
els.outlineText.textContent     = text;
els.outlineViewText.textContent = text;
}

// ── Outline text generation ───────────────────────────────────────────────

function generateBreadthThenDrillOutline() {
const roots = state.roots
.map(id => state.entities.items[id])
.filter(Boolean)
.filter(item => filterMatchesItem(item));
if (!roots.length) return ‘No topics yet.’;
const lines = [];
renderSiblingGroup(lines, roots, 0, ‘Top-level Topics’);
return lines.join(’\n’);
}

function renderSiblingGroup(lines, items, depth, headingLabel) {
const indent = ’  ‘.repeat(depth);
if (headingLabel) lines.push(`${indent}${headingLabel}:`);
items.forEach((item, idx) => lines.push(`${indent}- ${idx + 1}. ${flattenInline(itemLabel(item))}`));
lines.push(’’);
items.forEach((item, idx) => {
lines.push(`${indent}${idx + 1}) ${flattenInline(itemLabel(item))}`);
if (item.sourceList?.length) {
item.sourceList
.filter(src => [src.label, src.url, src.note].some(Boolean))
.forEach(src => {
const parts = [src.label, src.url, src.note].filter(Boolean).map(flattenInline);
lines.push(`${indent}  [source] ${parts.join(' | ')}`);
});
}
renderQuestionGroups(lines, item, depth + 1);
lines.push(’’);
});
}

function renderQuestionGroups(lines, item, depth) {
const indent    = ’  ‘.repeat(depth);
const questions = meaningfulQuestionsForItem(item);
if (!questions.length) { lines.push(`${indent}(no populated questions)`); return; }
questions.forEach((q, qIndex) => {
lines.push(`${indent}? ${qIndex + 1}. ${flattenInline(q.label || 'Blank question')}`);
const answers = meaningfulAnswersForQuestion(q);
if (!answers.length) { lines.push(`${indent}  (no populated answers)`); return; }
answers.forEach((answer, idx) => lines.push(`${indent}  - ${idx + 1}. ${flattenInline(itemLabel(answer))}`));
lines.push(’’);
answers.forEach((answer, idx) => {
lines.push(`${indent}  ${idx + 1}) ${flattenInline(itemLabel(answer))}`);
if (answer.sourceList?.length) {
answer.sourceList
.filter(src => [src.label, src.url, src.note].some(Boolean))
.forEach(src => {
const parts = [src.label, src.url, src.note].filter(Boolean).map(flattenInline);
lines.push(`${indent}    [source] ${parts.join(' | ')}`);
});
}
renderQuestionGroups(lines, answer, depth + 2);
lines.push(’’);
});
});
}

function flattenInline(text) {
return String(text || ‘’).replace(/\s+/g, ’ ’).trim() || ‘[blank]’;
}

// ── View / theme / sidebar ────────────────────────────────────────────────

function setTheme(theme) {
if (!THEMES.includes(theme)) theme = ‘modern’;
state.settings.theme = theme;
document.body.className = ‘theme-’ + theme;
// Keep both selects in sync
if (els.themeSelect)       els.themeSelect.value = theme;
if (els.themeSelectMobile) els.themeSelectMobile.value = theme;
persist();
}

function setMainView(view) {
state.settings.mainView = view === ‘outline’ ? ‘outline’ : ‘board’;
renderViewMode();
persist();
}

// ── Sidebar / drawer helpers ──────────────────────────────────────────────

// On mobile the sidebar is an overlay drawer (.drawer-left).
// On desktop it’s a static column toggled via sidebar-collapsed on workspace.
function isMobile() {
return window.innerWidth < 768;
}

function openSidebar() {
state.settings.sidebarOpen = true;
if (isMobile()) {
els.sidebar.classList.add(‘open’);
els.sidebar.setAttribute(‘aria-hidden’, ‘false’);
showScrim(() => closeSidebar());
} else {
renderSidebarState();
}
persist();
}

function closeSidebar() {
state.settings.sidebarOpen = false;
if (isMobile()) {
els.sidebar.classList.remove(‘open’);
els.sidebar.setAttribute(‘aria-hidden’, ‘true’);
hideScrim();
} else {
renderSidebarState();
}
persist();
}

function toggleSidebar() {
state.settings.sidebarOpen ? closeSidebar() : openSidebar();
}

function closeSidebarOnMobile() {
if (isMobile()) closeSidebar();
}

function renderSidebarState() {
// Desktop only: toggle column width
els.workspace.classList.toggle(‘sidebar-collapsed’, !state.settings.sidebarOpen);
}

// Overflow drawer (mobile secondary actions)
function openOverflowDrawer() {
els.overflowDrawer.classList.add(‘open’);
els.overflowDrawer.setAttribute(‘aria-hidden’, ‘false’);
els.overflowMenuBtn?.setAttribute(‘aria-expanded’, ‘true’);
showScrim(() => closeOverflowDrawer());
}

function closeOverflowDrawer() {
els.overflowDrawer.classList.remove(‘open’);
els.overflowDrawer.setAttribute(‘aria-hidden’, ‘true’);
els.overflowMenuBtn?.setAttribute(‘aria-expanded’, ‘false’);
hideScrim();
}

// Scrim (shared by sidebar + overflow drawer)
let scrimCallback = null;
function showScrim(onTap) {
scrimCallback = onTap;
els.drawerScrim.classList.add(‘open’);
}
function hideScrim() {
els.drawerScrim.classList.remove(‘open’);
scrimCallback = null;
}

// Search bar
function openSearchBar() {
els.searchBar.classList.add(‘open’);
els.searchBar.setAttribute(‘aria-hidden’, ‘false’);
els.searchInput.focus();
}
function closeSearchBar() {
els.searchBar.classList.remove(‘open’);
els.searchBar.setAttribute(‘aria-hidden’, ‘true’);
els.searchInput.value = ‘’;
state.ui.search = ‘’;
persist();
renderRootLane();
renderOutlineTree();
renderOutlineText();
}

function toggleTopTopics(forceValue) {
state.settings.showTopTopics = typeof forceValue === ‘boolean’ ? forceValue : !state.settings.showTopTopics;
renderTopTopicsState();
persist();
}

function renderTopTopicsState() {
els.topTopicsPanel.classList.toggle(‘hidden’, !state.settings.showTopTopics);
const label = state.settings.showTopTopics ? ‘Hide Topics’ : ‘Show Topics’;
if (els.toggleTopicsBtn)       els.toggleTopicsBtn.textContent = label;
if (els.toggleTopicsBtnMobile) els.toggleTopicsBtnMobile.textContent = ’⬜ ’ + label;
}

function renderViewMode() {
const board = state.settings.mainView !== ‘outline’;
els.boardView.classList.toggle(‘hidden’, !board);
els.outlineView.classList.toggle(‘hidden’, board);
[els.boardViewBtn, els.boardViewBtnMobile].forEach(btn => {
btn?.classList.toggle(‘btn-primary’, board);
btn?.classList.toggle(‘btn-soft’, !board);
});
[els.outlineViewBtn, els.outlineViewBtnMobile].forEach(btn => {
btn?.classList.toggle(‘btn-primary’, !board);
btn?.classList.toggle(‘btn-soft’, board);
});
}

// ── Main render ───────────────────────────────────────────────────────────

function render() {
normalizeState();
document.body.className = ‘theme-’ + (state.settings.theme || ‘modern’);
if (els.themeSelect)       els.themeSelect.value       = state.settings.theme || ‘modern’;
if (els.themeSelectMobile) els.themeSelectMobile.value = state.settings.theme || ‘modern’;
if (els.searchInput)       els.searchInput.value       = state.ui.search || ‘’;
renderSidebarState();
renderTopTopicsState();
renderViewMode();
renderRootLane();
renderCanvas();
renderOutlineTree();
renderOutlineText();
updateButtons();
}

function updateButtons() {
if (els.undoBtn)       els.undoBtn.disabled       = !state.history.past.length;
if (els.redoBtn)       els.redoBtn.disabled       = !state.history.future.length;
if (els.undoBtnMobile) els.undoBtnMobile.disabled = !state.history.past.length;
if (els.redoBtnMobile) els.redoBtnMobile.disabled = !state.history.future.length;
if (els.addAnswerBtn)  els.addAnswerBtn.disabled  = !state.ui.activeQuestionId;
if (els.selectionPill) els.selectionPill.textContent = getSelectedItem() ? itemLabel(getSelectedItem()) : ‘No selection’;
}

// ── Editable helpers ──────────────────────────────────────────────────────

let pushedThisFocus = false;
function pushHistoryOnce() {
if (pushedThisFocus) return;
pushedThisFocus = true;
pushHistory();
setTimeout(() => { pushedThisFocus = false; }, 0);
}

function attachEditable(element, onCommit, onBeforeEdit) {
element.addEventListener(‘focus’, () => {
onBeforeEdit?.();
if (element.dataset.empty === ‘true’) element.textContent = ‘’;
});
element.addEventListener(‘keydown’, event => {
if ((event.metaKey || event.ctrlKey) && event.key === ‘Enter’) element.blur();
});
element.addEventListener(‘blur’, () => onCommit(getEditableText(element)));
element.addEventListener(‘input’, () => toggleEditablePlaceholder(element));
}

function setEditableContent(el, value, placeholder) {
el.dataset.placeholder = placeholder;
const hasValue = Boolean((value || ‘’).trim());
el.textContent = hasValue ? value : placeholder;
toggleEditablePlaceholder(el, !hasValue);
}

function toggleEditablePlaceholder(el, forceEmpty) {
const text    = getEditableText(el);
const isEmpty = typeof forceEmpty === ‘boolean’ ? forceEmpty : !text;
el.dataset.empty = isEmpty ? ‘true’ : ‘false’;
if (isEmpty && document.activeElement !== el) {
el.textContent = el.dataset.placeholder || ‘’;
}
}

function getEditableText(el) {
const raw = (el.textContent || ‘’).trim();
return raw === (el.dataset.placeholder || ‘’) ? ‘’ : raw;
}

// ── Drag and drop (root lane) ─────────────────────────────────────────────

function wireDragAndDrop(element, arrayRef, itemId, onDone) {
element.addEventListener(‘dragstart’, event => {
dragState = { dragType: element.dataset.dragType, itemId, arrayRef };
event.dataTransfer.effectAllowed = ‘move’;
element.classList.add(‘dragging’);
});
element.addEventListener(‘dragend’, () => {
dragState = null;
element.classList.remove(‘dragging’);
});
element.addEventListener(‘dragover’, event => {
if (!dragState) return;
event.preventDefault();
event.dataTransfer.dropEffect = ‘move’;
});
element.addEventListener(‘drop’, event => {
if (!dragState) return;
event.preventDefault();
if (element.dataset.dragType !== dragState.dragType) return;
const from = arrayRef.indexOf(dragState.itemId);
const to   = arrayRef.indexOf(itemId);
if (from === -1 || to === -1 || from === to) return;
pushHistory();
arrayRef.splice(to, 0, arrayRef.splice(from, 1)[0]);
persist();
onDone?.();
});
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(value) {
return String(value || ‘’).replace(/&/g, ‘&’).replace(/</g, ‘<’).replace(/>/g, ‘>’).replace(/”/g, ‘"’).replace(/’/g, ‘'’);
}
function escapeAttr(value) {
return escapeHtml(value).replace(/`/g, ‘`’);
}

function download(filename, content, mime = ‘text/plain;charset=utf-8’) {
const blob = new Blob([content], { type: mime });
const url  = URL.createObjectURL(blob);
const a    = document.createElement(‘a’);
a.href = url; a.download = filename; a.click();
setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copyToClipboard(text, successMessage = ‘Copied to clipboard.’) {
try {
await navigator.clipboard.writeText(text);
flash(successMessage);
} catch {
flash(‘Clipboard access failed. Try Export instead.’);
}
}

function flash(message) {
clearTimeout(toastTimer);
const pill = els.selectionPill;
const original = pill.textContent;
pill.textContent = message;
toastTimer = setTimeout(() => {
pill.textContent = getSelectedItem() ? itemLabel(getSelectedItem()) : original;
}, 1800);
}

// ── Modal ─────────────────────────────────────────────────────────────────

function openModal(config) {
els.modalTitle.textContent    = config.title    || ‘Modal’;
els.modalSubtitle.textContent = config.subtitle || ‘’;
els.modalTextarea.value       = config.initialValue || ‘’;
els.modalTextarea.style.display = config.hideTextarea ? ‘none’ : ‘’;
els.modalActions.innerHTML = ‘’;
(config.actions || []).forEach(action => {
const btn = document.createElement(‘button’);
btn.type = ‘button’;
btn.className = action.primary ? ‘btn btn-primary’ : ‘btn btn-soft’;
btn.textContent = action.label;
btn.addEventListener(‘click’, () => action.onClick(els.modalTextarea.value));
els.modalActions.appendChild(btn);
});
els.modalBackdrop.classList.add(‘open’);
els.modalBackdrop.setAttribute(‘aria-hidden’, ‘false’);
setTimeout(() => {
if (!config.hideTextarea) els.modalTextarea.focus();
else els.modalActions.querySelector(‘button’)?.focus();
}, 10);
}

function closeModal() {
els.modalBackdrop.classList.remove(‘open’);
els.modalBackdrop.setAttribute(‘aria-hidden’, ‘true’);
}

function openConfirm(title, subtitle, onConfirm) {
openModal({
title, subtitle,
hideTextarea: true,
actions: [
{ label: ‘Confirm’, primary: true, onClick: () => { closeModal(); onConfirm(); } },
{ label: ‘Cancel’, onClick: closeModal },
],
});
}

// ── Import / export ───────────────────────────────────────────────────────

function exportJson() {
download(‘strategyfractal.json’, JSON.stringify(deepClone(state), null, 2), ‘application/json;charset=utf-8’);
}

function importJson(raw) {
try {
const parsed = JSON.parse(raw);
if (!parsed || !parsed.roots || !parsed.entities) throw new Error(‘Invalid JSON structure’);
const existingHistory = state.history;
state = parsed;
state.history = existingHistory || { past: [], future: [] };
if (!state.history.past)   state.history.past   = [];
if (!state.history.future) state.history.future = [];
normalizeState();
persist();
render();
closeModal();
flash(‘JSON imported.’);
} catch (err) {
alert(’Import failed: ’ + err.message);
}
}

function clearBoard() {
openConfirm(‘Reset Board’, ‘Reset to a fresh canvas? This will clear all current content.’, () => {
state = createInitialState();
persist();
render();
});
}

// ── Examples ──────────────────────────────────────────────────────────────

async function loadExamplesManifest() {
if (examplesManifest) return examplesManifest;
try {
const res = await fetch(‘examples/manifest.json’);
if (!res.ok) throw new Error(‘manifest not found’);
examplesManifest = await res.json();
} catch {
examplesManifest = [];
}
return examplesManifest;
}

async function populateExamplesDropdown(dropdownEl, btnEl) {
if (dropdownEl.classList.contains(‘open’)) {
dropdownEl.classList.remove(‘open’);
btnEl?.setAttribute(‘aria-expanded’, ‘false’);
return;
}
dropdownEl.innerHTML = ‘<div class="examples-dropdown-message">Loading…</div>’;
dropdownEl.classList.add(‘open’);
btnEl?.setAttribute(‘aria-expanded’, ‘true’);
const examples = await loadExamplesManifest();
dropdownEl.innerHTML = ‘’;
if (!examples.length) {
dropdownEl.innerHTML = ‘<div class="examples-dropdown-message">No examples available.</div>’;
return;
}
examples.forEach(example => {
const btn = document.createElement(‘button’);
btn.type = ‘button’;
btn.className = ‘examples-dropdown-item’;
btn.textContent = example.name;
btn.addEventListener(‘click’, () => {
dropdownEl.classList.remove(‘open’);
btnEl?.setAttribute(‘aria-expanded’, ‘false’);
loadExample(example.file, example.name);
});
dropdownEl.appendChild(btn);
});
}

async function loadExample(file, name) {
const doLoad = async () => {
try {
const res = await fetch(`examples/${file}`);
if (!res.ok) throw new Error(`Could not fetch examples/${file}`);
importJson(await res.text());
} catch (err) {
alert(’Failed to load example: ’ + err.message);
}
};
if (state.roots.some(id => isItemMeaningful(state.entities.items[id]))) {
openConfirm(`Load "${escapeHtml(name)}"`, ‘Your current board will be replaced.’, doLoad);
} else {
doLoad();
}
}

// ── Event wiring ──────────────────────────────────────────────────────────

// Bind a handler to both the desktop and mobile version of a button.
// closeDrawer=true will also close the overflow drawer when mobile btn fires.
function bindBoth(desktopId, mobileId, handler, closeDrawer = true) {
const dBtn = document.getElementById(desktopId);
const mBtn = document.getElementById(mobileId);
dBtn?.addEventListener(‘click’, handler);
mBtn?.addEventListener(‘click’, e => {
handler(e);
if (closeDrawer) closeOverflowDrawer();
});
}

function setupEvents() {
// ── Primary toolbar (always visible) ──────────────────────────────────
els.newRootBtn?.addEventListener(‘click’, addRoot);
els.addAnswerBtn?.addEventListener(‘click’, () => {
if (state.ui.activeQuestionId) addAnswerToQuestion(state.ui.activeQuestionId);
});

```
// ── View controls ──────────────────────────────────────────────────────
bindBoth('boardViewBtn',    'boardViewBtnMobile',    () => setMainView('board'));
bindBoth('outlineViewBtn',  'outlineViewBtnMobile',  () => setMainView('outline'));
bindBoth('toggleTopicsBtn', 'toggleTopicsBtnMobile', () => toggleTopTopics());

// ── Edit ───────────────────────────────────────────────────────────────
bindBoth('undoBtn',         'undoBtnMobile',         undo);
bindBoth('redoBtn',         'redoBtnMobile',         redo);
bindBoth('copyOutlineBtn',  'copyOutlineBtnMobile',  () => copyToClipboard(generateBreadthThenDrillOutline(), 'Outline copied.'));

// ── Add question (desktop + mobile drawer) ─────────────────────────────
bindBoth('addQuestionBtn', 'addQuestionBtnMobile', () => {
  const item = getSelectedItem();
  if (item) addCustomQuestion(item.id, '');
});

// ── Data ───────────────────────────────────────────────────────────────
bindBoth('exportJsonBtn', 'exportJsonBtnMobile', exportJson);
bindBoth('importJsonBtn', 'importJsonBtnMobile', () => openModal({
  title: 'Import StrategyFractal JSON',
  subtitle: 'Paste a previously exported JSON payload to resume a session.',
  actions: [
    { label: 'Import', primary: true, onClick: importJson },
    { label: 'Cancel', onClick: closeModal },
  ],
}));
bindBoth('clearBtn', 'clearBtnMobile', clearBoard);

// ── Examples dropdowns ─────────────────────────────────────────────────
els.examplesBtn?.addEventListener('click', e => {
  e.stopPropagation();
  populateExamplesDropdown(els.examplesDropdown, els.examplesBtn);
});
els.examplesBtnMobile?.addEventListener('click', e => {
  e.stopPropagation();
  populateExamplesDropdown(els.examplesDropdownMobile, els.examplesBtnMobile);
});
// Close desktop dropdown on outside click
document.addEventListener('click', e => {
  if (!els.examplesDropdown?.classList.contains('open')) return;
  if (!els.examplesBtn?.contains(e.target) && !els.examplesDropdown?.contains(e.target)) {
    els.examplesDropdown.classList.remove('open');
    els.examplesBtn?.setAttribute('aria-expanded', 'false');
  }
});

// ── Theme selects (keep both in sync) ──────────────────────────────────
els.themeSelect?.addEventListener('change', e => setTheme(e.target.value));
els.themeSelectMobile?.addEventListener('change', e => setTheme(e.target.value));

// ── Sidebar ────────────────────────────────────────────────────────────
els.toggleSidebarBtn?.addEventListener('click', () => toggleSidebar());
els.collapseSidebarInnerBtn?.addEventListener('click', () => closeSidebar());

// ── Overflow drawer ────────────────────────────────────────────────────
els.overflowMenuBtn?.addEventListener('click', () => openOverflowDrawer());
els.closeOverflowBtn?.addEventListener('click', () => closeOverflowDrawer());

// ── Scrim (closes whichever drawer is open) ────────────────────────────
els.drawerScrim?.addEventListener('click', () => scrimCallback?.());

// ── Search bar ─────────────────────────────────────────────────────────
els.searchToggleBtn?.addEventListener('click', () => openSearchBar());
els.searchCloseBtn?.addEventListener('click', () => closeSearchBar());
els.searchInput?.addEventListener('input', e => {
  state.ui.search = e.target.value;
  persist();
  renderRootLane();
  renderOutlineTree();
  renderOutlineText();
});

// ── Download / sidebar ─────────────────────────────────────────────────
els.downloadTextBtn?.addEventListener('click', () =>
  download('strategyfractal-outline.txt', generateBreadthThenDrillOutline()));

// ── Modal ──────────────────────────────────────────────────────────────
els.closeModalBtn?.addEventListener('click', closeModal);
els.modalBackdrop?.addEventListener('click', e => {
  if (e.target === els.modalBackdrop) closeModal();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
                  document.activeElement?.isContentEditable;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return;
  }
  if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
      ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')) {
    e.preventDefault(); redo(); return;
  }
  if (e.key === 'Escape') {
    if (els.modalBackdrop.classList.contains('open'))   { closeModal(); return; }
    if (els.overflowDrawer.classList.contains('open'))  { closeOverflowDrawer(); return; }
    if (els.sidebar.classList.contains('open'))         { closeSidebar(); return; }
    if (els.searchBar.classList.contains('open'))       { closeSearchBar(); return; }
    Object.values(state.entities.items).forEach(item => {
      if (item.nodeMode === 'expanded') item.nodeMode = 'collapsed';
    });
    persist();
    renderCanvas();
    return;
  }
  if (isInput) return;
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); addRoot(); }
  if (e.key.toLowerCase() === 'q') {
    e.preventDefault();
    const item = getSelectedItem();
    if (item) addCustomQuestion(item.id, '');
  }
  if (e.key.toLowerCase() === 'a') {
    e.preventDefault();
    if (state.ui.activeQuestionId) addAnswerToQuestion(state.ui.activeQuestionId);
  }
});

initPanEvents();
```

}

render();
setupEvents();
})();