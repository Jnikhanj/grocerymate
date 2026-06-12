const APP_VERSION = "1.0.0";
const STORAGE_KEY = "grocerymate-data-v1";

const DEFAULT_CATEGORIES = [
  "Fruit & Veg",
  "Meat & Seafood",
  "Dairy",
  "Bakery",
  "Pantry",
  "Frozen",
  "Drinks",
  "Snacks",
  "Cleaning",
  "Toiletries",
  "Other"
];

const DEFAULT_STORES = [
  "Any store",
  "Coles",
  "Woolworths",
  "Aldi",
  "Indian Grocery",
  "Costco",
  "Chemist Warehouse",
  "Other"
];

const state = {
  data: loadData(),
  view: "list",
  listFilter: "pending",
  search: "",
  categoryFilter: "All categories",
  storeFilter: "All stores"
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  summaryLine: document.querySelector("#summaryLine"),
  addForm: document.querySelector("#addForm"),
  itemName: document.querySelector("#itemName"),
  categorySelect: document.querySelector("#categorySelect"),
  storeSelect: document.querySelector("#storeSelect"),
  itemNote: document.querySelector("#itemNote"),
  quickStrip: document.querySelector("#quickStrip"),
  appContent: document.querySelector("#appContent"),
  toast: document.querySelector("#toast"),
  navTabs: [...document.querySelectorAll(".nav-tab")],
  itemModal: document.querySelector("#itemModal"),
  editForm: document.querySelector("#editForm"),
  editItemId: document.querySelector("#editItemId"),
  editName: document.querySelector("#editName"),
  editCategory: document.querySelector("#editCategory"),
  editStore: document.querySelector("#editStore"),
  editNote: document.querySelector("#editNote"),
  closeModalBtn: document.querySelector("#closeModalBtn"),
  deleteFromModalBtn: document.querySelector("#deleteFromModalBtn"),
  importInput: document.querySelector("#importInput"),
  installHelpBtn: document.querySelector("#installHelpBtn")
};

init();

function init() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  populateSelects();
  updateSummary();
  renderQuickStrip();
  render();
  bindEvents();
  registerServiceWorker();
}

function bindEvents() {
  els.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = cleanText(els.itemName.value);
    if (!name) return;

    addItem({
      name,
      category: els.categorySelect.value,
      store: els.storeSelect.value,
      note: cleanText(els.itemNote.value)
    });

    els.itemName.value = "";
    els.itemNote.value = "";
    els.itemName.focus();
  });

  els.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      els.navTabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  els.closeModalBtn.addEventListener("click", closeItemModal);
  els.itemModal.addEventListener("click", (event) => {
    if (event.target === els.itemModal) closeItemModal();
  });

  els.editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEditedItem();
  });

  els.deleteFromModalBtn.addEventListener("click", () => {
    const item = findItem(els.editItemId.value);
    if (!item) return;
    if (confirm(`Delete ${item.name}?`)) {
      deleteItem(item.id);
      closeItemModal();
    }
  });

  els.importInput.addEventListener("change", importBackup);

  els.installHelpBtn.addEventListener("click", () => {
    showToast("On iPhone: Safari → Share → Add to Home Screen");
  });

  window.addEventListener("online", updateSummary);
  window.addEventListener("offline", updateSummary);
}

function loadData() {
  const fallback = {
    items: [],
    favourites: [],
    recent: [],
    categories: DEFAULT_CATEGORIES,
    stores: DEFAULT_STORES,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return fallback;

    return {
      ...fallback,
      ...saved,
      items: Array.isArray(saved.items) ? saved.items : [],
      favourites: Array.isArray(saved.favourites) ? saved.favourites : [],
      recent: Array.isArray(saved.recent) ? saved.recent : [],
      categories: mergeUnique(DEFAULT_CATEGORIES, saved.categories || []),
      stores: mergeUnique(DEFAULT_STORES, saved.stores || [])
    };
  } catch {
    return fallback;
  }
}

function saveData() {
  state.data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  updateSummary();
}

function addItem(input, options = {}) {
  const now = new Date().toISOString();
  const name = titleCase(cleanText(input.name));
  const category = input.category || "Other";
  const store = input.store || "Any store";
  const note = cleanText(input.note || "");

  const duplicate = state.data.items.find((item) =>
    !item.bought &&
    normalise(item.name) === normalise(name) &&
    item.category === category &&
    item.store === store
  );

  if (duplicate && !options.forceDuplicate) {
    duplicate.note = note || duplicate.note;
    duplicate.updatedAt = now;
    duplicate.createdAt = now;
    showToast(`${name} is already on your list`);
  } else {
    state.data.items.unshift({
      id: createId(),
      name,
      category,
      store,
      note,
      bought: false,
      createdAt: now,
      updatedAt: now
    });
    showToast(`${name} added`);
  }

  rememberRecent({ name, category, store, note });
  saveData();
  renderQuickStrip();
  render();
}

function toggleBought(id) {
  const item = findItem(id);
  if (!item) return;
  item.bought = !item.bought;
  item.updatedAt = new Date().toISOString();
  saveData();
  render();
}

function deleteItem(id) {
  const item = findItem(id);
  state.data.items = state.data.items.filter((entry) => entry.id !== id);
  saveData();
  render();
  if (item) showToast(`${item.name} deleted`);
}

function clearBought() {
  const count = state.data.items.filter((item) => item.bought).length;
  if (!count) {
    showToast("No bought items to clear");
    return;
  }
  if (!confirm(`Clear ${count} bought item${count === 1 ? "" : "s"}?`)) return;
  state.data.items = state.data.items.filter((item) => !item.bought);
  saveData();
  render();
  showToast("Bought items cleared");
}

function toggleFavouriteFromItem(id) {
  const item = findItem(id);
  if (!item) return;
  toggleFavourite({ name: item.name, category: item.category, store: item.store, note: item.note });
}

function toggleFavourite(template) {
  const key = normalise(template.name);
  const exists = state.data.favourites.some((fav) => normalise(fav.name) === key);

  if (exists) {
    state.data.favourites = state.data.favourites.filter((fav) => normalise(fav.name) !== key);
    showToast(`${template.name} removed from favourites`);
  } else {
    state.data.favourites.unshift({
      id: createId(),
      name: titleCase(template.name),
      category: template.category || "Other",
      store: template.store || "Any store",
      note: template.note || "",
      createdAt: new Date().toISOString()
    });
    showToast(`${template.name} saved as favourite`);
  }

  saveData();
  renderQuickStrip();
  render();
}

function rememberRecent(template) {
  const key = normalise(template.name);
  const filtered = state.data.recent.filter((item) => normalise(item.name) !== key);
  state.data.recent = [
    {
      id: createId(),
      name: titleCase(template.name),
      category: template.category || "Other",
      store: template.store || "Any store",
      note: template.note || "",
      lastUsedAt: new Date().toISOString()
    },
    ...filtered
  ].slice(0, 18);
}

function openItemModal(id) {
  const item = findItem(id);
  if (!item) return;
  populateSelect(els.editCategory, state.data.categories, item.category);
  populateSelect(els.editStore, state.data.stores, item.store);
  els.editItemId.value = item.id;
  els.editName.value = item.name;
  els.editNote.value = item.note || "";
  els.itemModal.classList.remove("hidden");
  setTimeout(() => els.editName.focus(), 50);
}

function closeItemModal() {
  els.itemModal.classList.add("hidden");
}

function saveEditedItem() {
  const item = findItem(els.editItemId.value);
  if (!item) return;
  item.name = titleCase(cleanText(els.editName.value));
  item.category = els.editCategory.value;
  item.store = els.editStore.value;
  item.note = cleanText(els.editNote.value);
  item.updatedAt = new Date().toISOString();
  rememberRecent(item);
  saveData();
  renderQuickStrip();
  render();
  closeItemModal();
  showToast("Item updated");
}

function render() {
  if (state.view === "list") renderListView();
  if (state.view === "favourites") renderFavouritesView();
  if (state.view === "settings") renderSettingsView();
}

function renderListView() {
  const items = getFilteredItems();
  const grouped = groupByCategory(items);
  const pendingCount = state.data.items.filter((item) => !item.bought).length;
  const boughtCount = state.data.items.filter((item) => item.bought).length;

  els.appContent.innerHTML = `
    <section class="panel toolbar">
      <div class="stat-grid">
        <div class="stat"><strong>${pendingCount}</strong><span>Pending</span></div>
        <div class="stat"><strong>${boughtCount}</strong><span>Bought</span></div>
        <div class="stat"><strong>${state.data.favourites.length}</strong><span>Favourites</span></div>
      </div>
      <input id="searchInput" type="search" placeholder="Search list" value="${escapeHtml(state.search)}" />
      <div class="toolbar-row" aria-label="List filter">
        ${filterChip("pending", "Pending")}
        ${filterChip("all", "All")}
        ${filterChip("bought", "Bought")}
      </div>
      <div class="compact-grid">
        <label>
          <span>Category filter</span>
          <select id="categoryFilter">
            ${["All categories", ...state.data.categories].map((category) => optionHtml(category, state.categoryFilter)).join("")}
          </select>
        </label>
        <label>
          <span>Store filter</span>
          <select id="storeFilter">
            ${["All stores", ...state.data.stores].map((store) => optionHtml(store, state.storeFilter)).join("")}
          </select>
        </label>
      </div>
      <div class="toolbar-row">
        <button type="button" class="chip" data-action="clear-bought">Clear bought</button>
        <button type="button" class="chip" data-action="copy-list">Copy list</button>
        <button type="button" class="chip" data-action="share-list">Share</button>
      </div>
    </section>
    <section class="panel">
      ${items.length ? renderGroupedItems(grouped) : emptyState("🛒", "No items here", "Add an item or change your filter.")}
    </section>
  `;

  document.querySelector("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderListView();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.listFilter = button.dataset.filter;
      renderListView();
    });
  });

  document.querySelector("#categoryFilter").addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    renderListView();
  });

  document.querySelector("#storeFilter").addEventListener("change", (event) => {
    state.storeFilter = event.target.value;
    renderListView();
  });

  bindItemButtons();
  bindToolbarActions();
}

function renderFavouritesView() {
  const favourites = state.data.favourites;
  els.appContent.innerHTML = `
    <section class="panel">
      <h2>Favourites</h2>
      <p class="subtitle">Tap a favourite to add it to your current shopping list.</p>
      <div class="toolbar-row" style="margin-top: 12px;">
        <button type="button" class="chip" data-action="seed-common">Add common starter items</button>
      </div>
    </section>
    <section class="panel">
      ${favourites.length ? `
        <div class="favourite-grid">
          ${favourites.map((fav) => `
            <button type="button" class="favourite-card" data-add-favourite="${fav.id}">
              <strong>${escapeHtml(fav.name)}</strong>
              <span>${escapeHtml(fav.category)} • ${escapeHtml(fav.store)}</span>
            </button>
          `).join("")}
        </div>
      ` : emptyState("⭐", "No favourites yet", "Star items from your list so you can add them again quickly.")}
    </section>
  `;

  document.querySelectorAll("[data-add-favourite]").forEach((button) => {
    button.addEventListener("click", () => {
      const fav = state.data.favourites.find((item) => item.id === button.dataset.addFavourite);
      if (fav) addItem(fav);
    });
  });

  const seedBtn = document.querySelector("[data-action='seed-common']");
  seedBtn?.addEventListener("click", seedCommonFavourites);
}

function renderSettingsView() {
  els.appContent.innerHTML = `
    <section class="panel">
      <h2>Settings</h2>
      <p class="subtitle">Your grocery data is stored on this phone in Safari storage.</p>
    </section>

    <section class="panel settings-list">
      ${settingRow("Export backup", "Download a JSON backup of your list, favourites, categories and stores.", "export-backup")}
      ${settingRow("Import backup", "Replace current app data from a previous JSON backup.", "import-backup")}
      ${settingRow("Copy list as text", "Copy pending items grouped by category.", "copy-list")}
      ${settingRow("Clear bought items", "Remove items you have already ticked off.", "clear-bought")}
      ${settingRow("Delete all app data", "Reset list, favourites, recent items and custom settings.", "reset-app", true)}
    </section>

    <section class="panel">
      <h2>Categories</h2>
      ${managerInput("category")}
      <div class="manager-list">
        ${state.data.categories.map((category) => managerPill("category", category)).join("")}
      </div>
    </section>

    <section class="panel">
      <h2>Stores</h2>
      ${managerInput("store")}
      <div class="manager-list">
        ${state.data.stores.map((store) => managerPill("store", store)).join("")}
      </div>
    </section>

    <section class="panel">
      <h2>About</h2>
      <p class="subtitle">GroceryMate v${APP_VERSION}. Offline-first personal grocery list.</p>
    </section>
  `;

  bindToolbarActions();
  bindManagers();
}

function renderQuickStrip() {
  const suggestions = [...state.data.favourites, ...state.data.recent]
    .filter((item, index, array) => array.findIndex((entry) => normalise(entry.name) === normalise(item.name)) === index)
    .slice(0, 12);

  els.quickStrip.innerHTML = suggestions.length
    ? suggestions.map((item) => `<button type="button" class="chip subtle" data-quick-add="${item.id}">+ ${escapeHtml(item.name)}</button>`).join("")
    : `<span class="chip subtle">Recent and favourite items will appear here</span>`;

  els.quickStrip.querySelectorAll("[data-quick-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const template = [...state.data.favourites, ...state.data.recent].find((item) => item.id === button.dataset.quickAdd);
      if (template) addItem(template);
    });
  });
}

function renderGroupedItems(grouped) {
  return Object.entries(grouped).map(([category, items]) => `
    <div class="group-title"><span>${escapeHtml(category)}</span><span>${items.length}</span></div>
    <div class="item-list">
      ${items.map(renderItemCard).join("")}
    </div>
  `).join("");
}

function renderItemCard(item) {
  const favourite = isFavourite(item.name);
  return `
    <article class="item-card ${item.bought ? "bought" : ""}">
      <button type="button" class="check-button" data-toggle="${item.id}" aria-label="${item.bought ? "Mark as not bought" : "Mark as bought"}">${item.bought ? "✓" : ""}</button>
      <div>
        <p class="item-name">${escapeHtml(item.name)}</p>
        <div class="meta-line">
          <span class="badge">${escapeHtml(item.category)}</span>
          <span class="badge">${escapeHtml(item.store)}</span>
          ${item.note ? `<span class="badge note">${escapeHtml(item.note)}</span>` : ""}
        </div>
      </div>
      <div class="item-actions">
        <button type="button" class="action-button ${favourite ? "starred" : ""}" data-favourite="${item.id}" aria-label="Toggle favourite">${favourite ? "★" : "☆"}</button>
        <button type="button" class="action-button" data-edit="${item.id}" aria-label="Edit item">Edit</button>
      </div>
    </article>
  `;
}

function bindItemButtons() {
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleBought(button.dataset.toggle));
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openItemModal(button.dataset.edit));
  });

  document.querySelectorAll("[data-favourite]").forEach((button) => {
    button.addEventListener("click", () => toggleFavouriteFromItem(button.dataset.favourite));
  });
}

function bindToolbarActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    button.addEventListener("click", () => {
      if (action === "clear-bought") clearBought();
      if (action === "copy-list") copyListText();
      if (action === "share-list") shareListText();
      if (action === "export-backup") exportBackup();
      if (action === "import-backup") els.importInput.click();
      if (action === "reset-app") resetApp();
    });
  });
}

function bindManagers() {
  document.querySelectorAll("[data-manager-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const type = form.dataset.managerForm;
      const input = form.querySelector("input");
      addManagerValue(type, cleanText(input.value));
      input.value = "";
    });
  });

  document.querySelectorAll("[data-remove-manager]").forEach((button) => {
    button.addEventListener("click", () => {
      const [type, value] = button.dataset.removeManager.split("::");
      removeManagerValue(type, value);
    });
  });
}

function getFilteredItems() {
  let items = [...state.data.items];

  if (state.listFilter === "pending") items = items.filter((item) => !item.bought);
  if (state.listFilter === "bought") items = items.filter((item) => item.bought);
  if (state.categoryFilter !== "All categories") items = items.filter((item) => item.category === state.categoryFilter);
  if (state.storeFilter !== "All stores") items = items.filter((item) => item.store === state.storeFilter);

  const query = normalise(state.search);
  if (query) {
    items = items.filter((item) => [item.name, item.category, item.store, item.note].some((value) => normalise(value || "").includes(query)));
  }

  return items.sort((a, b) => {
    if (a.bought !== b.bought) return a.bought ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function groupByCategory(items) {
  return items.reduce((groups, item) => {
    groups[item.category] ||= [];
    groups[item.category].push(item);
    return groups;
  }, {});
}

function updateSummary() {
  const pending = state.data.items.filter((item) => !item.bought).length;
  const bought = state.data.items.filter((item) => item.bought).length;
  const network = navigator.onLine ? "Online" : "Offline";
  els.summaryLine.textContent = `${pending} pending • ${bought} bought • ${network}`;
}

function populateSelects() {
  populateSelect(els.categorySelect, state.data.categories, "Other");
  populateSelect(els.storeSelect, state.data.stores, "Any store");
  populateSelect(els.editCategory, state.data.categories, "Other");
  populateSelect(els.editStore, state.data.stores, "Any store");
}

function populateSelect(select, values, selectedValue) {
  select.innerHTML = values.map((value) => optionHtml(value, selectedValue)).join("");
}

function optionHtml(value, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`;
}

function filterChip(filter, label) {
  return `<button type="button" class="chip ${state.listFilter === filter ? "active" : ""}" data-filter="${filter}">${label}</button>`;
}

function settingRow(title, description, action, danger = false) {
  return `
    <div class="setting-row">
      <div>
        <strong>${title}</strong>
        <p>${description}</p>
      </div>
      <button type="button" class="${danger ? "secondary-button" : "ghost-button"}" data-action="${action}">${danger ? "Reset" : "Open"}</button>
    </div>
  `;
}

function managerInput(type) {
  const label = type === "category" ? "Add category" : "Add store";
  return `
    <form data-manager-form="${type}" class="add-row">
      <input type="text" placeholder="${label}" maxlength="40" />
      <button type="submit" class="primary-button">Add</button>
    </form>
  `;
}

function managerPill(type, value) {
  const defaults = type === "category" ? DEFAULT_CATEGORIES : DEFAULT_STORES;
  const canRemove = !defaults.includes(value);
  return `
    <span class="manager-pill">
      ${escapeHtml(value)}
      ${canRemove ? `<button type="button" data-remove-manager="${type}::${escapeHtml(value)}" aria-label="Remove ${escapeHtml(value)}">×</button>` : ""}
    </span>
  `;
}

function addManagerValue(type, value) {
  if (!value) return;
  const key = type === "category" ? "categories" : "stores";
  if (state.data[key].some((item) => normalise(item) === normalise(value))) {
    showToast(`${value} already exists`);
    return;
  }
  state.data[key].push(titleCase(value));
  saveData();
  populateSelects();
  renderSettingsView();
  showToast(`${value} added`);
}

function removeManagerValue(type, value) {
  const key = type === "category" ? "categories" : "stores";
  if (!confirm(`Remove ${value}? Existing items will be moved to Other/Any store.`)) return;

  state.data[key] = state.data[key].filter((item) => item !== value);
  if (type === "category") {
    state.data.items.forEach((item) => { if (item.category === value) item.category = "Other"; });
    state.data.favourites.forEach((item) => { if (item.category === value) item.category = "Other"; });
    state.data.recent.forEach((item) => { if (item.category === value) item.category = "Other"; });
  } else {
    state.data.items.forEach((item) => { if (item.store === value) item.store = "Any store"; });
    state.data.favourites.forEach((item) => { if (item.store === value) item.store = "Any store"; });
    state.data.recent.forEach((item) => { if (item.store === value) item.store = "Any store"; });
  }

  saveData();
  populateSelects();
  renderSettingsView();
  showToast(`${value} removed`);
}

function seedCommonFavourites() {
  const starterItems = [
    ["Milk", "Dairy"],
    ["Bread", "Bakery"],
    ["Eggs", "Dairy"],
    ["Bananas", "Fruit & Veg"],
    ["Rice", "Pantry"],
    ["Chicken", "Meat & Seafood"],
    ["Yoghurt", "Dairy"],
    ["Toilet paper", "Toiletries"],
    ["Dishwashing liquid", "Cleaning"],
    ["Onion", "Fruit & Veg"]
  ];

  let added = 0;
  starterItems.forEach(([name, category]) => {
    if (!isFavourite(name)) {
      state.data.favourites.push({
        id: createId(),
        name,
        category,
        store: "Any store",
        note: "",
        createdAt: new Date().toISOString()
      });
      added += 1;
    }
  });

  saveData();
  renderQuickStrip();
  renderFavouritesView();
  showToast(added ? `${added} favourites added` : "Starter favourites already added");
}

async function copyListText() {
  const text = buildListText();
  if (!text) {
    showToast("No pending items to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("List copied");
  } catch {
    showToast("Copy failed. Try Share instead.");
  }
}

async function shareListText() {
  const text = buildListText();
  if (!text) {
    showToast("No pending items to share");
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: "Grocery List", text });
  } else {
    await copyListText();
  }
}

function buildListText() {
  const pending = state.data.items.filter((item) => !item.bought);
  if (!pending.length) return "";
  const grouped = groupByCategory(pending);
  return [
    "Grocery List",
    "",
    ...Object.entries(grouped).flatMap(([category, items]) => [
      category,
      ...items.map((item) => `☐ ${item.name}${item.store && item.store !== "Any store" ? ` — ${item.store}` : ""}${item.note ? ` (${item.note})` : ""}`),
      ""
    ])
  ].join("\n").trim();
}

function exportBackup() {
  const payload = JSON.stringify({
    app: "GroceryMate",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state.data
  }, null, 2);

  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `grocerymate-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exported");
}

function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = parsed.data || parsed;
      if (!incoming || !Array.isArray(incoming.items)) throw new Error("Invalid backup");
      if (!confirm("Import backup and replace current GroceryMate data?")) return;

      state.data = {
        ...state.data,
        ...incoming,
        items: Array.isArray(incoming.items) ? incoming.items : [],
        favourites: Array.isArray(incoming.favourites) ? incoming.favourites : [],
        recent: Array.isArray(incoming.recent) ? incoming.recent : [],
        categories: mergeUnique(DEFAULT_CATEGORIES, incoming.categories || []),
        stores: mergeUnique(DEFAULT_STORES, incoming.stores || [])
      };

      saveData();
      populateSelects();
      renderQuickStrip();
      render();
      showToast("Backup imported");
    } catch {
      showToast("Import failed. Invalid backup file.");
    }
  };
  reader.readAsText(file);
}

function resetApp() {
  if (!confirm("Delete all GroceryMate data from this phone?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.data = loadData();
  state.view = "list";
  state.search = "";
  state.listFilter = "pending";
  state.categoryFilter = "All categories";
  state.storeFilter = "All stores";
  populateSelects();
  renderQuickStrip();
  render();
  showToast("App data reset");
}

function findItem(id) {
  return state.data.items.find((item) => item.id === id);
}

function isFavourite(name) {
  return state.data.favourites.some((fav) => normalise(fav.name) === normalise(name));
}

function emptyState(emoji, title, message) {
  return `
    <div class="empty-state">
      <div class="emoji">${emoji}</div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalise(value) {
  return cleanText(value).toLowerCase();
}

function titleCase(value) {
  const keepLower = new Set(["and", "or", "of", "the"]);
  return cleanText(value).split(" ").map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && keepLower.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
}

function mergeUnique(primary, secondary) {
  return [...primary, ...secondary]
    .map(cleanText)
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((entry) => normalise(entry) === normalise(item)) === index);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Offline mode will be unavailable if registration fails.
    });
  });
}
