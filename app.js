(function() {
  const STORAGE_KEY = 'strategyfractal-state-v2';
  const DEFAULT_QUESTIONS = ['Why', 'What', 'How', 'Who'];
  const THEMES = ['modern', 'sticky', 'playful', 'minimal'];

  const els = {
    workspace: document.getElementById('workspace'),
    topTopicsPanel: document.getElementById('topTopicsPanel'),
    rootLane: document.getElementById('rootLane'),
    focusCardMount: document.getElementById('focusCardMount'),
    orbit: document.getElementById('orbit'),
    branchDock: document.getElementById('branchDock'),
    outlineTree: document.getElementById('outlineTree'),
    outlineText: document.getElementById('outlineText'),
    outlineViewText: document.getElementById('outlineViewText'),
    selectionPill: document.getElementById('selectionPill'),
    boardView: document.getElementById('boardView'),
    outlineView: document.getElementById('outlineView'),
    newRootBtn: document.getElementById('newRootBtn'),
    addQuestionBtn: document.getElementById('addQuestionBtn'),
    addAnswerBtn: document.getElementById('addAnswerBtn'),
    toggleTopicsBtn: document.getElementById('toggleTopicsBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    collapseSidebarInnerBtn: document.getElementById('collapseSidebarInnerBtn'),
    boardViewBtn: document.getElementById('boardViewBtn'),
    outlineViewBtn: document.getElementById('outlineViewBtn'),
    themeSelect: document.getElementById('themeSelect'),
    undoBtn: document.getElementById('undoBtn'),
    redoBtn: document.getElementById('redoBtn'),
    copyOutlineBtn: document.getElementById('copyOutlineBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    importJsonBtn: document.getElementById('importJsonBtn'),
    clearBtn: document.getElementById('clearBtn'),
    searchInput: document.getElementById('searchInput'),
    downloadTextBtn: document.getElementById('downloadTextBtn'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalTextarea: document.getElementById('modalTextarea'),
    modalActions: document.getElementById('modalActions'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    examplesBtn: document.getElementById('examplesBtn'),
    examplesDropdown: document.getElementById('examplesDropdown')
  };

  let state = loadState() || createInitialState();
  let dragState = null;
  let toastTimer = null;
  let pushedThisFocus = false;
  let examplesManifest = null;

  function createInitialState() {
    const s = {
      version: 2,
      settings: {
        theme: 'modern',
        mainView: 'board',
        sidebarOpen: true,
        showTopTopics: true,
      },
      ui: {
        selectedItemId: null,
        activeQuestionId: null,
        search: '',
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
    const first = createItemInternal(s, { kind: 'topic', text: '' });
    s.roots.push(first.id);
    s.ui.selectedItemId = first.id;
    s.ui.activeQuestionId = null;
    return s;
  }

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function createItemInternal(targetState, { kind = 'answer', text = '', parentQuestionId = null } = {}) {
    const id = uid('item');
    targetState.entities.items[id] = {
      id,
      kind,
      text,
      questionIds: [],
      parentQuestionId,
      sourceList: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (parentQuestionId) {
      const q = targetState.entities.questions[parentQuestionId];
      if (q) q.answerIds.push(id);
    }
    return targetState.entities.items[id];
  }

  function createQuestionInternal(targetState, parentItemId, label = '') {
    const id = uid('q');
    targetState.entities.questions[id] = {
      id,
      parentItemId,
      label,
      answerIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    targetState.entities.items[parentItemId].questionIds.push(id);
    return targetState.entities.questions[id];
  }

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
    if (!state.settings) state.settings = { theme: 'modern', mainView: 'board', sidebarOpen: true, showTopTopics: true };
    if (typeof state.settings.showTopTopics !== 'boolean') state.settings.showTopTopics = true;
    if (!state.ui) state.ui = { selectedItemId: state.roots[0] || null, activeQuestionId: null, search: '' };
    if (!state.history) state.history = { past: [], future: [] };
    if (!state.entities) state.entities = { items: {}, questions: {} };
    if (!Array.isArray(state.roots)) state.roots = [];

    state.roots = state.roots.filter(id => state.entities.items[id]);
    if (!state.roots.length) {
      const fallback = createItemInternal(state, { kind: 'topic', text: '' });
      state.roots.push(fallback.id);
    }

    Object.values(state.entities.items).forEach(item => {
      if (!Array.isArray(item.questionIds)) item.questionIds = [];
      if (!Array.isArray(item.sourceList)) item.sourceList = [];
    });
    Object.values(state.entities.questions).forEach(q => {
      if (!Array.isArray(q.answerIds)) q.answerIds = [];
    });

    if (!state.entities.items[state.ui.selectedItemId]) state.ui.selectedItemId = state.roots[0] || null;
    const selected = getSelectedItem();
    if (!selected || !selected.questionIds.includes(state.ui.activeQuestionId)) state.ui.activeQuestionId = null;
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to save state:', err);
    }
  }

  function loadState() {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      const rawV1 = localStorage.getItem('strategyfractal-state-v1');
      const raw = rawV2 || rawV1;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.entities || !parsed.roots) return null;
      if (!parsed.history) parsed.history = { past: [], future: [] };
      if (!parsed.settings) parsed.settings = { theme: 'modern', mainView: 'board', sidebarOpen: true, showTopTopics: true };
      if (typeof parsed.settings.showTopTopics !== 'boolean') parsed.settings.showTopTopics = true;
      if (!parsed.ui) parsed.ui = { selectedItemId: parsed.roots[0] || null, activeQuestionId: null, search: '' };
      return parsed;
    } catch (err) {
      console.warn('Failed to load state:', err);
      return null;
    }
  }

  function normalizeLabel(label) {
    return (label || '').trim().toLowerCase();
  }

  function colorClassForLabel(label) {
    const value = normalizeLabel(label);
    if (!value) return 'blank';
    if (value === 'why') return 'why';
    if (value === 'what') return 'what';
    if (value === 'how') return 'how';
    if (value === 'who') return 'who';
    return 'custom';
  }

  function isDefaultQuestionLabel(label) {
    return DEFAULT_QUESTIONS.some(q => normalizeLabel(q) === normalizeLabel(label));
  }

  function itemLabel(item) {
    const text = (item?.text || '').trim();
    return text || (item?.kind === 'topic' ? 'Untitled topic' : 'Untitled answer');
  }

  function getSelectedItem() {
    return state.entities.items[state.ui.selectedItemId] || null;
  }

  function getActiveQuestion() {
    return state.entities.questions[state.ui.activeQuestionId] || null;
  }

  function findQuestionByLabel(parentItemId, label) {
    const item = state.entities.items[parentItemId];
    if (!item) return null;
    const target = normalizeLabel(label);
    return item.questionIds
      .map(id => state.entities.questions[id])
      .find(q => normalizeLabel(q?.label) === target) || null;
  }

  function findFirstMeaningfulQuestionId(item) {
    if (!item) return null;
    const meaningful = item.questionIds.find(qid => isQuestionMeaningful(state.entities.questions[qid]));
    return meaningful || item.questionIds[0] || null;
  }

  function selectItem(itemId, preferredQuestionId = null) {
    const item = state.entities.items[itemId];
    if (!item) return;
    state.ui.selectedItemId = itemId;
    if (preferredQuestionId && state.entities.questions[preferredQuestionId] && item.questionIds.includes(preferredQuestionId)) {
      state.ui.activeQuestionId = preferredQuestionId;
    } else if (state.ui.activeQuestionId && item.questionIds.includes(state.ui.activeQuestionId)) {
      // keep current
    } else {
      state.ui.activeQuestionId = findFirstMeaningfulQuestionId(item) || null;
    }
    persist();
    render();
  }

  function addRoot() {
    pushHistory();
    const item = createItemInternal(state, { kind: 'topic', text: '' });
    state.roots.push(item.id);
    state.ui.selectedItemId = item.id;
    state.ui.activeQuestionId = null;
    persist();
    render();
    requestAnimationFrame(() => focusEditable(`[data-item-text="${item.id}"]`));
  }

  function addCustomQuestion(parentItemId, label = '') {
    const item = state.entities.items[parentItemId];
    if (!item) return;
    let chosen = label;
    if (!chosen) {
      chosen = prompt('Name this custom question branch:', 'Custom');
      if (chosen === null) return;
    }
    chosen = (chosen || '').trim() || 'Custom';
    pushHistory();
    const q = createQuestionInternal(state, parentItemId, chosen);
    state.ui.activeQuestionId = q.id;
    persist();
    render();
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-question-label="${q.id}"]`);
      if (target) focusEditable(`[data-question-label="${q.id}"]`);
    });
  }

  function activateDefaultQuestion(parentItemId, label) {
    const item = state.entities.items[parentItemId];
    if (!item) return;
    const existing = findQuestionByLabel(parentItemId, label);
    if (existing) {
      state.ui.activeQuestionId = existing.id;
      persist();
      renderBranchDock();
      renderOrbit(item);
      renderOutlineTree();
      renderOutlineText();
      updateButtons();
      return;
    }
    pushHistory();
    const q = createQuestionInternal(state, parentItemId, label);
    state.ui.activeQuestionId = q.id;
    persist();
    render();
  }

  function addAnswer(parentQuestionId) {
    const q = state.entities.questions[parentQuestionId];
    if (!q) return;
    pushHistory();
    const item = createItemInternal(state, { kind: 'answer', text: '', parentQuestionId });
    state.ui.selectedItemId = q.parentItemId;
    state.ui.activeQuestionId = q.id;
    persist();
    render();
    requestAnimationFrame(() => focusEditable(`[data-item-text="${item.id}"]`));
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

  function deleteQuestion(questionId) {
    const q = state.entities.questions[questionId];
    if (!q) return;
    if (!confirm('Delete this question branch and all nested answers beneath it?')) return;
    pushHistory();
    const parentItemId = q.parentItemId;
    deleteQuestionRecursive(questionId);
    const parentItem = state.entities.items[parentItemId];
    if (parentItem) {
      parentItem.questionIds = parentItem.questionIds.filter(id => id !== questionId);
    }
    if (state.ui.activeQuestionId === questionId) state.ui.activeQuestionId = null;
    persist();
    render();
  }

  function deleteQuestionRecursive(questionId) {
    const q = state.entities.questions[questionId];
    if (!q) return;
    q.answerIds.slice().forEach(answerId => deleteItemRecursive(answerId));
    delete state.entities.questions[questionId];
  }

  function deleteItemRecursive(itemId) {
    const item = state.entities.items[itemId];
    if (!item) return;
    item.questionIds.slice().forEach(questionId => deleteQuestionRecursive(questionId));
    if (item.parentQuestionId) {
      const pq = state.entities.questions[item.parentQuestionId];
      if (pq) pq.answerIds = pq.answerIds.filter(id => id !== itemId);
    }
    state.roots = state.roots.filter(id => id !== itemId);
    if (state.ui.selectedItemId === itemId) {
      if (item.parentQuestionId) {
        const pq = state.entities.questions[item.parentQuestionId];
        state.ui.selectedItemId = pq?.parentItemId || state.roots[0] || null;
        state.ui.activeQuestionId = pq?.id || null;
      } else {
        state.ui.selectedItemId = state.roots[0] || null;
        state.ui.activeQuestionId = null;
      }
    }
    delete state.entities.items[itemId];
  }

  function deleteItem(itemId) {
    const item = state.entities.items[itemId];
    if (!item) return;
    if (!confirm('Delete this card and all nested branches beneath it?')) return;
    pushHistory();
    deleteItemRecursive(itemId);
    normalizeState();
    persist();
    render();
  }

  function updateItemText(itemId, text) {
    const item = state.entities.items[itemId];
    if (!item) return;
    item.text = text;
    item.updatedAt = Date.now();
    persist();
    renderSideEffectsOnly();
  }

  function updateQuestionLabel(questionId, label) {
    const q = state.entities.questions[questionId];
    if (!q) return;
    q.label = label;
    q.updatedAt = Date.now();
    persist();
    render();
  }

  function addSource(itemId) {
    const item = state.entities.items[itemId];
    if (!item) return;
    pushHistory();
    item.sourceList.push({ id: uid('src'), label: '', url: '', note: '' });
    persist();
    render();
  }

  function updateSource(itemId, sourceId, key, value) {
    const item = state.entities.items[itemId];
    if (!item) return;
    const source = item.sourceList.find(s => s.id === sourceId);
    if (!source) return;
    source[key] = value;
    item.updatedAt = Date.now();
    persist();
    renderSideEffectsOnly();
  }

  function deleteSource(itemId, sourceId) {
    const item = state.entities.items[itemId];
    if (!item) return;
    pushHistory();
    item.sourceList = item.sourceList.filter(s => s.id !== sourceId);
    persist();
    render();
  }

  function setTheme(theme) {
    if (!THEMES.includes(theme)) theme = 'modern';
    state.settings.theme = theme;
    document.body.className = 'theme-' + theme;
    persist();
  }

  function setMainView(view) {
    state.settings.mainView = view === 'outline' ? 'outline' : 'board';
    renderViewMode();
    persist();
  }

  function toggleSidebar(forceValue) {
    state.settings.sidebarOpen = typeof forceValue === 'boolean' ? forceValue : !state.settings.sidebarOpen;
    renderSidebarState();
    persist();
  }

  function toggleTopTopics(forceValue) {
    state.settings.showTopTopics = typeof forceValue === 'boolean' ? forceValue : !state.settings.showTopTopics;
    renderTopTopicsState();
    persist();
  }

  function renderSidebarState() {
    els.workspace.classList.toggle('sidebar-collapsed', !state.settings.sidebarOpen);
  }

  function renderTopTopicsState() {
    els.topTopicsPanel.classList.toggle('hidden-panel', !state.settings.showTopTopics);
    els.toggleTopicsBtn.textContent = state.settings.showTopTopics ? 'Hide Topics' : 'Show Topics';
  }

  function renderViewMode() {
    const board = state.settings.mainView !== 'outline';
    els.boardView.classList.toggle('hidden', !board);
    els.outlineView.classList.toggle('hidden', board);
    els.boardViewBtn.classList.toggle('primary', board);
    els.outlineViewBtn.classList.toggle('primary', !board);
    els.boardViewBtn.classList.toggle('soft', !board);
    els.outlineViewBtn.classList.toggle('soft', board);
  }

  function render() {
    normalizeState();
    document.body.className = 'theme-' + (state.settings.theme || 'modern');
    els.themeSelect.value = state.settings.theme || 'modern';
    els.searchInput.value = state.ui.search || '';
    renderSidebarState();
    renderTopTopicsState();
    renderViewMode();
    renderRootLane();
    renderFocusArea();
    renderBranchDock();
    renderOutlineTree();
    renderOutlineText();
    updateButtons();
  }

  function updateButtons() {
    els.undoBtn.disabled = !state.history.past.length;
    els.redoBtn.disabled = !state.history.future.length;
    els.addAnswerBtn.disabled = !getActiveQuestion();
    els.selectionPill.textContent = getSelectedItem() ? itemLabel(getSelectedItem()) : 'No selection';
  }

  function renderSideEffectsOnly() {
    renderRootLane();
    renderBranchDock();
    renderOutlineTree();
    renderOutlineText();
    updateButtons();
  }

  function filterMatchesItem(item) {
    const query = (state.ui.search || '').trim().toLowerCase();
    if (!query) return true;
    const inText = (item.text || '').toLowerCase().includes(query);
    const inSources = item.sourceList.some(src => [src.label, src.url, src.note].join(' ').toLowerCase().includes(query));
    const inQuestions = item.questionIds.some(qId => (state.entities.questions[qId]?.label || '').toLowerCase().includes(query));
    return inText || inSources || inQuestions;
  }

  function hasDirectItemContent(item) {
    if (!item) return false;
    return Boolean((item.text || '').trim()) || item.sourceList.some(src => Boolean((src.label || '').trim() || (src.url || '').trim() || (src.note || '').trim()));
  }

  function isItemMeaningful(item) {
    if (!item) return false;
    if (hasDirectItemContent(item)) return true;
    return item.questionIds.some(qid => isQuestionMeaningful(state.entities.questions[qid]));
  }

  function isQuestionMeaningful(question) {
    if (!question) return false;
    const answers = question.answerIds.map(id => state.entities.items[id]).filter(Boolean);
    return answers.some(answer => isItemMeaningful(answer));
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

  function countMeaningfulAnswers(question) {
    return question.answerIds.map(id => state.entities.items[id]).filter(item => isItemMeaningful(item)).length;
  }

  function renderRootLane() {
    els.rootLane.innerHTML = '';
    if (!state.roots.length) {
      els.rootLane.innerHTML = '<div class="empty-state">No topics yet. Click <strong>New Topic</strong> to start your board.</div>';
      return;
    }
    let visibleCount = 0;
    state.roots.forEach((itemId, index) => {
      const item = state.entities.items[itemId];
      if (!item) return;
      if (!filterMatchesItem(item)) return;
      visibleCount += 1;
      const branchCount = countMeaningfulDescendants(itemId);
      const liveQuestions = countInstantiatedQuestions(item);
      const card = document.createElement('div');
      card.className = 'root-chip' + (state.ui.selectedItemId === itemId ? ' active' : '');
      card.draggable = true;
      card.dataset.dragType = 'roots';
      card.dataset.id = itemId;
      card.innerHTML = `
        <div class="sort-row">
          <div class="sort-left">
            <div class="drag" title="Drag to reorder">⋮⋮</div>
            <strong>${escapeHtml(itemLabel(item))}</strong>
          </div>
          <small>#${index + 1}</small>
        </div>
        <small>${liveQuestions} live question branch${liveQuestions === 1 ? '' : 'es'} • ${branchCount} populated descendant${branchCount === 1 ? '' : 's'}</small>
      `;
      card.addEventListener('click', () => selectItem(itemId));
      wireDragAndDrop(card, state.roots, itemId, () => render());
      els.rootLane.appendChild(card);
    });
    if (!visibleCount) {
      els.rootLane.innerHTML = '<div class="empty-state">No matches for the current search.</div>';
    }
  }

  function renderFocusArea() {
    const item = getSelectedItem();
    els.focusCardMount.innerHTML = '';
    els.orbit.innerHTML = '';
    if (!item) {
      els.focusCardMount.innerHTML = '<div class="empty-state">Select a topic or create a new one to begin.</div>';
      return;
    }

    const card = document.createElement('div');
    card.className = 'item-card focus-card';
    card.innerHTML = `
      <div class="item-meta">
        <span class="pill">${item.kind === 'topic' ? 'Topic' : 'Answer / Subtopic'}</span>
        <span class="muted">${item.parentQuestionId ? 'Child of ' + escapeHtml(state.entities.questions[item.parentQuestionId]?.label || 'question') : 'Top level'}</span>
      </div>
      <div class="item-text" data-item-text="${item.id}" contenteditable="true" spellcheck="true"></div>
      <div class="mini-toolbar">
        <button type="button" class="soft" data-action="add-source">+ Source</button>
        <button type="button" class="soft" data-action="add-question">+ Question</button>
        ${item.parentQuestionId ? '<button type="button" class="soft" data-action="go-parent">↑ Parent</button>' : ''}
        <button type="button" class="soft" data-action="duplicate-root">Duplicate</button>
        <button type="button" class="soft" data-action="delete-item">Delete</button>
      </div>
      <div class="inline-sources" data-source-mount="${item.id}"></div>
      <div class="status">
        <span class="pill">Questions live in the orbit</span>
        <span class="pill">Answers open below in the branch dock</span>
        <span class="pill">Empty branches stay out of the outline</span>
      </div>
    `;
    els.focusCardMount.appendChild(card);

    const editable = card.querySelector(`[data-item-text="${item.id}"]`);
    setEditableContent(editable, item.text, item.kind === 'topic' ? 'What\'s the topic for today?' : 'Add an answer or subtopic…');
    attachEditable(editable, value => updateItemText(item.id, value), () => pushHistory());
    renderSourceEditor(card.querySelector(`[data-source-mount="${item.id}"]`), item, 'card');

    card.addEventListener('click', (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'add-question') addCustomQuestion(item.id, '');
      if (action === 'add-source') addSource(item.id);
      if (action === 'go-parent' && item.parentQuestionId) {
        const parentQ = state.entities.questions[item.parentQuestionId];
        if (parentQ) selectItem(parentQ.parentItemId, parentQ.id);
      }
      if (action === 'duplicate-root') {
        pushHistory();
        const dup = cloneSubtreeAsRoot(item.id);
        state.roots.push(dup.id);
        state.ui.selectedItemId = dup.id;
        state.ui.activeQuestionId = findFirstMeaningfulQuestionId(dup) || null;
        persist();
        render();
      }
      if (action === 'delete-item') deleteItem(item.id);
    });

    renderOrbit(item);
  }

  function cloneSubtreeAsRoot(itemId) {
    const original = state.entities.items[itemId];
    const clone = createItemInternal(state, { kind: 'topic', text: original.text });
    clone.sourceList = deepClone(original.sourceList || []);
    original.questionIds.forEach(origQId => {
      const origQ = state.entities.questions[origQId];
      if (!origQ) return;
      const newQ = createQuestionInternal(state, clone.id, origQ.label);
      origQ.answerIds.forEach(origAnswerId => cloneAnswerBranch(origAnswerId, newQ.id));
    });
    return clone;
  }

  function cloneAnswerBranch(itemId, parentQuestionId) {
    const original = state.entities.items[itemId];
    const clone = createItemInternal(state, { kind: original.kind, text: original.text, parentQuestionId });
    clone.sourceList = deepClone(original.sourceList || []);
    original.questionIds.forEach(origQId => {
      const origQ = state.entities.questions[origQId];
      if (!origQ) return;
      const newQ = createQuestionInternal(state, clone.id, origQ.label);
      origQ.answerIds.forEach(origAnswerId => cloneAnswerBranch(origAnswerId, newQ.id));
    });
    return clone;
  }

  function buildOrbitEntries(item) {
    const entries = DEFAULT_QUESTIONS.map(label => {
      const existing = findQuestionByLabel(item.id, label);
      return {
        kind: existing ? 'question' : 'default',
        label,
        questionId: existing?.id || null,
        count: existing ? countMeaningfulAnswers(existing) : 0,
        ghost: !existing,
      };
    });

    const customQuestions = item.questionIds
      .map(id => state.entities.questions[id])
      .filter(q => q && !isDefaultQuestionLabel(q.label));

    customQuestions.forEach(q => {
      entries.push({
        kind: 'question',
        label: q.label || 'Custom',
        questionId: q.id,
        count: countMeaningfulAnswers(q),
        ghost: false,
      });
    });

    entries.push({
      kind: 'custom-add',
      label: '+ Custom',
      questionId: null,
      count: customQuestions.length,
      ghost: false,
    });

    return entries;
  }

  function renderOrbit(item) {
    const entries = buildOrbitEntries(item);
    if (!entries.length) return;
    const stage = document.querySelector('.canvas-zone');
    const stageRect = stage.getBoundingClientRect();
    const cardRect = document.querySelector('.focus-card-wrap').getBoundingClientRect();
    const centerX = cardRect.right - stageRect.left + 18;
    const centerY = cardRect.top - stageRect.top + cardRect.height / 2;
    const radiusX = Math.min(250, Math.max(155, stageRect.width - cardRect.width - 100));
    const radiusY = Math.min(200, Math.max(120, stageRect.height / 2 - 40));
    const startAngle = -72;
    const endAngle = 72;

    entries.forEach((entry, index) => {
      const angle = entries.length === 1 ? 0 : startAngle + ((endAngle - startAngle) * index / (entries.length - 1));
      const rad = angle * Math.PI / 180;
      const x = centerX + Math.cos(rad) * radiusX;
      const y = centerY + Math.sin(rad) * radiusY;
      const cc = entry.kind === 'custom-add' ? 'custom' : colorClassForLabel(entry.label);
      const bubble = document.createElement('div');
      bubble.className = `orbit-bubble bubble-${cc} ${entry.ghost ? 'ghost' : ''} ${state.ui.activeQuestionId === entry.questionId ? 'active' : ''}`;
      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.transform = 'translate(-40%, -50%)';
      bubble.innerHTML = `<span>${escapeHtml((entry.label || '').trim() || 'Blank')}</span><small>${entry.count}</small>`;
      bubble.addEventListener('click', () => {
        if (entry.kind === 'default') {
          activateDefaultQuestion(item.id, entry.label);
          return;
        }
        if (entry.kind === 'custom-add') {
          addCustomQuestion(item.id, '');
          return;
        }
        state.ui.activeQuestionId = entry.questionId;
        persist();
        renderBranchDock();
        renderOrbit(item);
        renderOutlineTree();
        renderOutlineText();
        updateButtons();
      });
      els.orbit.appendChild(bubble);
    });
  }

  function renderBranchDock() {
    const item = getSelectedItem();
    const q = getActiveQuestion();
    els.branchDock.innerHTML = '';
    if (!item) {
      els.branchDock.innerHTML = '<div class="empty-state">Select a topic to edit its strategy branches.</div>';
      return;
    }

    if (!q) {
      els.branchDock.innerHTML = `
        <div class="branch-empty">
          <strong>No branch selected yet.</strong><br />
          Click a question bubble in the orbit to open a branch. Empty question branches stay off the outline until you add content.
        </div>
      `;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.innerHTML = `
      <div class="panel-body">
        <div class="branch-header">
          <div class="branch-title-group">
            <span class="chip ${colorClassForLabel(q.label)} active">${escapeHtml(q.label || 'Blank')}</span>
            ${isDefaultQuestionLabel(q.label) ? '<span class="pill">Default branch</span>' : `<div class="branch-label-edit" contenteditable="true" data-question-label="${q.id}"></div>`}
          </div>
          <div class="branch-actions">
            <button type="button" class="soft" data-action="add-answer">+ Answer</button>
            <button type="button" class="soft" data-action="delete-question">Delete Branch</button>
          </div>
        </div>
        <div class="status">
          <span class="pill">${q.answerIds.length} answer card${q.answerIds.length === 1 ? '' : 's'}</span>
          <span class="pill">Drag answers to reorder</span>
          <span class="pill">Focus an answer to keep drilling down</span>
        </div>
        <div id="answerList" class="answer-list"></div>
      </div>
    `;
    els.branchDock.appendChild(wrap);

    const branchLabel = wrap.querySelector(`[data-question-label="${q.id}"]`);
    if (branchLabel) {
      setEditableContent(branchLabel, q.label, 'Custom question');
      attachEditable(branchLabel, value => updateQuestionLabel(q.id, value), () => pushHistory());
    }

    wrap.addEventListener('click', event => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'add-answer') addAnswer(q.id);
      if (action === 'delete-question') deleteQuestion(q.id);
    });

    renderAnswerList(wrap.querySelector('#answerList'), q);
  }

  function buildChildQuestionSummary(item) {
    return buildOrbitEntries(item)
      .filter(entry => entry.kind !== 'custom-add')
      .map(entry => `<span class="chip ${colorClassForLabel(entry.label)}">${escapeHtml(entry.label)} <small>${entry.count}</small></span>`)
      .join('');
  }

  function renderAnswerList(container, question) {
    container.innerHTML = '';
    if (!question.answerIds.length) {
      container.innerHTML = '<div class="branch-empty">No answers yet. Add one, type into it, and this branch will start showing up in the tree and exports.</div>';
      return;
    }
    question.answerIds.forEach(answerId => {
      const item = state.entities.items[answerId];
      if (!item) return;
      const sourceCount = item.sourceList.length;
      const card = document.createElement('div');
      card.className = 'answer-card sortable-item';
      card.draggable = true;
      card.dataset.dragType = 'answers:' + question.id;
      card.dataset.id = answerId;
      card.innerHTML = `
        <div class="sort-row">
          <div class="sort-left">
            <div class="drag">⋮⋮</div>
            <span class="pill">${sourceCount} source${sourceCount === 1 ? '' : 's'}</span>
            <span class="pill">${countInstantiatedQuestions(item)} live question branch${countInstantiatedQuestions(item) === 1 ? '' : 'es'}</span>
          </div>
          <div class="sort-right">
            <button type="button" class="soft" data-action="focus-item">Focus</button>
            <button type="button" class="soft" data-action="add-source">+ Source</button>
            <button type="button" class="soft" data-action="delete-item">Delete</button>
          </div>
        </div>
        <div class="answer-text" contenteditable="true" data-item-text="${item.id}"></div>
        <div class="mini-toolbar">${buildChildQuestionSummary(item)}</div>
        <div class="inline-sources" data-source-mount="${item.id}"></div>
      `;
      wireDragAndDrop(card, question.answerIds, answerId, () => render());
      const answerText = card.querySelector(`[data-item-text="${item.id}"]`);
      setEditableContent(answerText, item.text, 'Add an answer or subtopic…');
      attachEditable(answerText, value => updateItemText(item.id, value), () => pushHistory());
      renderSourceEditor(card.querySelector(`[data-source-mount="${item.id}"]`), item, 'answer');
      card.addEventListener('click', event => {
        const action = event.target?.dataset?.action;
        if (!action) return;
        if (action === 'focus-item') selectItem(item.id);
        if (action === 'add-source') addSource(item.id);
        if (action === 'delete-item') deleteItem(item.id);
      });
      container.appendChild(card);
    });
  }

  function renderSourceEditor(container, item, mode) {
    if (!container) return;
    container.innerHTML = '';
    if (!item.sourceList.length) {
      if (mode === 'card') {
        container.innerHTML = '<div class="muted" style="font-size: 0.82rem;">No sources on this card yet.</div>';
      }
      return;
    }
    item.sourceList.forEach(src => {
      const row = document.createElement('div');
      row.className = 'source-grid';
      row.innerHTML = `
        <div class="source-row">
          <input type="text" data-key="label" value="${escapeAttr(src.label || '')}" placeholder="Source label" />
          <input type="url" data-key="url" value="${escapeAttr(src.url || '')}" placeholder="https://…" />
          <input type="text" data-key="note" class="source-note" value="${escapeAttr(src.note || '')}" placeholder="Optional note or citation context" />
        </div>
        <div class="sort-row">
          <div class="sort-left">
            ${src.url ? `<a href="${escapeAttr(src.url)}" target="_blank" rel="noopener noreferrer" class="pill">Open ↗</a>` : ''}
          </div>
          <div class="sort-right">
            <button type="button" class="soft" data-action="delete-source">Delete</button>
          </div>
        </div>
      `;
      row.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', pushHistoryOnce);
        input.addEventListener('input', e => updateSource(item.id, src.id, e.target.dataset.key, e.target.value));
      });
      row.querySelector('[data-action="delete-source"]').addEventListener('click', () => deleteSource(item.id, src.id));
      container.appendChild(row);
    });
  }

  function renderOutlineTree() {
    els.outlineTree.innerHTML = '';
    if (!state.roots.length) {
      els.outlineTree.innerHTML = '<div class="empty-state">Nothing on the board yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    state.roots.forEach(rootId => {
      const item = state.entities.items[rootId];
      if (!item || !filterMatchesItem(item)) return;
      frag.appendChild(renderOutlineItem(item));
    });
    if (!frag.childNodes.length) {
      els.outlineTree.innerHTML = '<div class="empty-state">No matches for the current search.</div>';
    } else {
      els.outlineTree.appendChild(frag);
    }
  }

  function renderOutlineItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'outline-node';
    const row = document.createElement('div');
    row.className = 'outline-item-row';
    row.innerHTML = `
      <button class="outline-select ${state.ui.selectedItemId === item.id ? 'active' : ''}">${escapeHtml(itemLabel(item))}</button>
      <span class="pill">${item.kind}</span>
      ${item.parentQuestionId ? `<span class="pill">via ${escapeHtml(state.entities.questions[item.parentQuestionId]?.label || 'question')}</span>` : '<span class="pill">top-level</span>'}
    `;
    row.querySelector('.outline-select').addEventListener('click', () => selectItem(item.id));
    wrapper.appendChild(row);

    meaningfulQuestionsForItem(item).forEach(q => {
      const qNode = document.createElement('div');
      qNode.className = 'outline-node';
      const cc = colorClassForLabel(q.label);
      qNode.innerHTML = `
        <div class="outline-question-row">
          <button class="outline-select ${state.ui.activeQuestionId === q.id ? 'active' : ''}">? ${escapeHtml(q.label || 'Blank')}</button>
          <span class="chip ${cc}">${escapeHtml(q.label || 'Blank')}</span>
          <span class="pill">${meaningfulAnswersForQuestion(q).length}</span>
        </div>
      `;
      qNode.querySelector('.outline-select').addEventListener('click', () => selectItem(item.id, q.id));
      meaningfulAnswersForQuestion(q).forEach(answer => {
        qNode.appendChild(renderOutlineItem(answer));
      });
      wrapper.appendChild(qNode);
    });
    return wrapper;
  }

  function renderOutlineText() {
    const text = generateBreadthThenDrillOutline();
    els.outlineText.textContent = text;
    els.outlineViewText.textContent = text;
  }

  function generateBreadthThenDrillOutline() {
    const roots = state.roots
      .map(id => state.entities.items[id])
      .filter(Boolean)
      .filter(item => filterMatchesItem(item));
    if (!roots.length) return 'No topics yet.';
    const lines = [];
    renderSiblingGroup(lines, roots, 0, 'Top-level Topics');
    return lines.join('\n');
  }

  function renderSiblingGroup(lines, items, depth, headingLabel) {
    const indent = '  '.repeat(depth);
    if (headingLabel) lines.push(`${indent}${headingLabel}:`);
    items.forEach((item, idx) => {
      lines.push(`${indent}- ${idx + 1}. ${flattenInline(itemLabel(item))}`);
    });
    lines.push('');
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
      lines.push('');
    });
  }

  function renderQuestionGroups(lines, item, depth) {
    const indent = '  '.repeat(depth);
    const questions = meaningfulQuestionsForItem(item);
    if (!questions.length) {
      lines.push(`${indent}(no populated questions)`);
      return;
    }
    questions.forEach((q, qIndex) => {
      const label = flattenInline(q.label || 'Blank question');
      lines.push(`${indent}? ${qIndex + 1}. ${label}`);
      const answers = meaningfulAnswersForQuestion(q);
      if (!answers.length) {
        lines.push(`${indent}  (no populated answers)`);
        return;
      }
      answers.forEach((answer, idx) => {
        lines.push(`${indent}  - ${idx + 1}. ${flattenInline(itemLabel(answer))}`);
      });
      lines.push('');
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
        lines.push('');
      });
    });
  }

  function flattenInline(text) {
    return String(text || '').replace(/\s+/g, ' ').trim() || '[blank]';
  }

  function wireDragAndDrop(element, arrayRef, itemId, onDone) {
    element.addEventListener('dragstart', event => {
      dragState = { dragType: element.dataset.dragType, itemId, arrayRef };
      event.dataTransfer.effectAllowed = 'move';
      element.classList.add('dragging');
    });
    element.addEventListener('dragend', () => {
      dragState = null;
      element.classList.remove('dragging');
    });
    element.addEventListener('dragover', event => {
      if (!dragState) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    element.addEventListener('drop', event => {
      if (!dragState) return;
      event.preventDefault();
      const sameGroup = dragState.arrayRef === arrayRef || element.dataset.dragType === dragState.dragType;
      if (!sameGroup) return;
      const from = arrayRef.indexOf(dragState.itemId);
      const to = arrayRef.indexOf(itemId);
      if (from === -1 || to === -1 || from === to) return;
      pushHistory();
      arrayRef.splice(to, 0, arrayRef.splice(from, 1)[0]);
      persist();
      onDone?.();
    });
  }

  function attachEditable(element, onCommit, onBeforeEdit) {
    element.addEventListener('focus', () => {
      onBeforeEdit?.();
      const placeholder = element.dataset.placeholder || '';
      if (element.textContent === placeholder && element.dataset.empty === 'true') {
        element.textContent = '';
      }
    });
    element.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        element.blur();
      }
    });
    element.addEventListener('blur', () => {
      const value = getEditableText(element);
      onCommit(value);
    });
    element.addEventListener('input', () => {
      toggleEditablePlaceholder(element);
    });
  }

  function pushHistoryOnce() {
    if (pushedThisFocus) return;
    pushedThisFocus = true;
    pushHistory();
    setTimeout(() => { pushedThisFocus = false; }, 0);
  }

  function setEditableContent(el, value, placeholder) {
    el.dataset.placeholder = placeholder;
    const hasValue = Boolean((value || '').trim());
    el.textContent = hasValue ? value : placeholder;
    toggleEditablePlaceholder(el, !hasValue);
  }

  function toggleEditablePlaceholder(el, forceEmpty) {
    const text = getEditableText(el);
    const isEmpty = typeof forceEmpty === 'boolean' ? forceEmpty : !text;
    el.dataset.empty = isEmpty ? 'true' : 'false';
    if (isEmpty && document.activeElement !== el) {
      el.textContent = el.dataset.placeholder || '';
    }
  }

  function getEditableText(el) {
    const raw = (el.textContent || '').trim();
    return raw === (el.dataset.placeholder || '') ? '' : raw;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function download(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyToClipboard(text, successMessage = 'Copied to clipboard.') {
    try {
      await navigator.clipboard.writeText(text);
      flash(successMessage);
    } catch (err) {
      console.warn('Clipboard copy failed', err);
      flash('Clipboard access failed. Try Export instead.');
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

  function openModal(config) {
    els.modalTitle.textContent = config.title || 'Modal';
    els.modalSubtitle.textContent = config.subtitle || '';
    els.modalTextarea.value = config.initialValue || '';
    els.modalActions.innerHTML = '';
    (config.actions || []).forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.primary ? 'primary' : 'soft';
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick(els.modalTextarea.value));
      els.modalActions.appendChild(btn);
    });
    els.modalBackdrop.classList.add('open');
    setTimeout(() => els.modalTextarea.focus(), 10);
  }

  function closeModal() {
    els.modalBackdrop.classList.remove('open');
  }

  function exportJson() {
    const payload = deepClone(state);
    download('strategyfractal.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  }

  function importJson(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.roots || !parsed.entities) throw new Error('Invalid JSON structure');
      const existingHistory = state.history;
      state = parsed;
      state.history = existingHistory || { past: [], future: [] };
      if (!state.history.past) state.history.past = [];
      if (!state.history.future) state.history.future = [];
      normalizeState();
      persist();
      render();
      closeModal();
      flash('JSON imported.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  function clearBoard() {
    if (!confirm('Reset the board to a fresh StrategyFractal canvas? This clears local storage.')) return;
    state = createInitialState();
    persist();
    render();
  }

  function hasAnyContent() {
    return state.roots.some(id => isItemMeaningful(state.entities.items[id]));
  }

  async function loadExamplesManifest() {
    if (examplesManifest) return examplesManifest;
    try {
      const res = await fetch('examples/manifest.json');
      if (!res.ok) throw new Error('manifest not found');
      examplesManifest = await res.json();
    } catch {
      examplesManifest = [];
    }
    return examplesManifest;
  }

  async function toggleExamplesDropdown() {
    const dropdown = els.examplesDropdown;
    if (dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      return;
    }
    dropdown.innerHTML = '<div class="examples-dropdown-message">Loading…</div>';
    dropdown.classList.add('open');
    const examples = await loadExamplesManifest();
    dropdown.innerHTML = '';
    if (!examples.length) {
      dropdown.innerHTML = '<div class="examples-dropdown-message">No examples available.</div>';
      return;
    }
    examples.forEach(example => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'examples-dropdown-item';
      btn.textContent = example.name;
      btn.addEventListener('click', () => loadExample(example.file, example.name));
      dropdown.appendChild(btn);
    });
  }

  async function loadExample(file, name) {
    els.examplesDropdown.classList.remove('open');
    if (hasAnyContent() && !confirm(`Load "${name}"? Your current board will be replaced.`)) return;
    try {
      const res = await fetch(`examples/${file}`);
      if (!res.ok) throw new Error(`Could not fetch examples/${file}`);
      const raw = await res.text();
      importJson(raw);
    } catch (err) {
      alert('Failed to load example: ' + err.message);
    }
  }

  function setupEvents() {
    els.newRootBtn.addEventListener('click', addRoot);
    els.addQuestionBtn.addEventListener('click', () => {
      const item = getSelectedItem();
      if (item) addCustomQuestion(item.id, '');
    });
    els.addAnswerBtn.addEventListener('click', () => {
      if (state.ui.activeQuestionId) addAnswer(state.ui.activeQuestionId);
    });
    els.toggleTopicsBtn.addEventListener('click', () => toggleTopTopics());
    els.toggleSidebarBtn.addEventListener('click', () => toggleSidebar());
    els.collapseSidebarInnerBtn.addEventListener('click', () => toggleSidebar(false));
    els.boardViewBtn.addEventListener('click', () => setMainView('board'));
    els.outlineViewBtn.addEventListener('click', () => setMainView('outline'));
    els.themeSelect.addEventListener('change', e => setTheme(e.target.value));
    els.undoBtn.addEventListener('click', undo);
    els.redoBtn.addEventListener('click', redo);
    els.copyOutlineBtn.addEventListener('click', () => copyToClipboard(generateBreadthThenDrillOutline(), 'Outline copied.'));
    els.exportJsonBtn.addEventListener('click', exportJson);
    els.importJsonBtn.addEventListener('click', () => openModal({
      title: 'Import StrategyFractal JSON',
      subtitle: 'Paste a previously exported JSON payload to resume a session.',
      actions: [
        { label: 'Import', primary: true, onClick: importJson },
        { label: 'Cancel', onClick: closeModal }
      ]
    }));
    els.clearBtn.addEventListener('click', clearBoard);
    els.searchInput.addEventListener('input', e => {
      state.ui.search = e.target.value;
      persist();
      renderRootLane();
      renderOutlineTree();
      renderOutlineText();
    });
    els.downloadTextBtn.addEventListener('click', () => download('strategyfractal-outline.txt', generateBreadthThenDrillOutline()));
    els.closeModalBtn.addEventListener('click', closeModal);
    els.modalBackdrop.addEventListener('click', e => {
      if (e.target === els.modalBackdrop) closeModal();
    });
    els.examplesBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleExamplesDropdown();
    });
    document.addEventListener('click', e => {
      if (!els.examplesDropdown.classList.contains('open')) return;
      if (!els.examplesBtn.contains(e.target) && !els.examplesDropdown.contains(e.target)) {
        els.examplesDropdown.classList.remove('open');
      }
    });

    document.addEventListener('keydown', e => {
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        closeModal();
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
        if (state.ui.activeQuestionId) addAnswer(state.ui.activeQuestionId);
      }
    });
  }

  render();
  setupEvents();
})();
