<template>
  <div class="app-container">

    <!-- ═══ HEADER ═══ -->
    <div class="header">
      <div class="header-title">
        <h1>Parts Inventory Alert</h1>
        <span class="header-sub">Multi-Warehouse Management</span>
      </div>
      <div class="warehouse-controls">
        <label class="control-label">Select Warehouse</label>
        <select v-model="currentWarehouse" class="warehouse-select">
          <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">
            {{ warehouse.name }}
          </option>
        </select>
        <button @click="addWarehouse" class="btn btn-success">+ Add Warehouse</button>
        <button @click="renameWarehouse" class="btn btn-warning">Rename</button>
        <button @click="deleteWarehouse" class="btn btn-danger">Delete Warehouse</button>
      </div>
    </div>

    <!-- ═══ STATUS BAR ═══ -->
    <div class="status-bar" :class="statusBarClass">
      <span class="status-warehouse">
        Current Warehouse: <strong>{{ getCurrentWarehouseName() }}</strong>
      </span>
      <span v-if="minStockStatus === 'own'" class="status-badge status-badge-ok">
        ✓ Minimum Stock Configured
      </span>
      <span v-else-if="minStockStatus === 'nca'" class="status-badge status-badge-nca">
        ⬡ Using NCA Default ({{ ncaWarehouseName }})
      </span>
      <span v-else class="status-badge status-badge-warn">
        ⚠ Minimum Stock Not Configured
      </span>
    </div>

    <!-- ═══ IMPORT & TEMPLATES CARD ═══ -->
    <div class="card">
      <div class="card-heading">
        <span class="card-title-icon">↑</span>
        <h2 class="card-title">Import & Templates</h2>
      </div>
      <div class="import-grid">

        <!-- Minimum Stock -->
        <div class="import-section">
          <div class="import-section-label">Minimum Stock</div>
          <div class="import-actions">
            <label class="file-btn-wrapper">
              <input type="file" accept=".xls,.xlsx" @change="handleMinStockUpload" class="file-input-hidden" />
              <span class="btn btn-primary btn-sm">Upload File</span>
            </label>
            <button @click="downloadMinStockTemplate" class="btn btn-outline btn-sm">↓ Download Template</button>
            <button @click="clearMinStock" class="btn btn-ghost-danger btn-sm">Clear</button>
          </div>
        </div>

        <div class="import-divider"></div>

        <!-- Current Inventory -->
        <div class="import-section">
          <div class="import-section-label">Current Inventory</div>
          <div class="import-actions">
            <label class="file-btn-wrapper">
              <input type="file" accept=".xls,.xlsx" @change="handleStockUpload" class="file-input-hidden" />
              <span class="btn btn-primary btn-sm">Upload File</span>
            </label>
            <button @click="downloadStockTemplate" class="btn btn-outline btn-sm">↓ Download Template</button>
            <button @click="clearStock" class="btn btn-ghost-danger btn-sm">Clear</button>
          </div>
        </div>

      </div>

      <!-- NCA template bulk action -->
      <div class="bulk-action-row">
        <div class="bulk-action-info">
          <span class="bulk-action-label">NCA Master Template</span>
          <span class="bulk-action-desc">
            NCA's minimum stock config is used as the default for all warehouses without their own configuration.
            New warehouses automatically inherit it.
          </span>
        </div>
        <div class="bulk-action-buttons">
          <button @click="downloadNcaTemplate" class="btn btn-outline-nca">
            ↓ Export NCA Parts Data
          </button>
          <button @click="applyNcaToAll" class="btn btn-nca">
            Apply NCA Minimum Stock to All Warehouses
          </button>
        </div>
      </div>

      <!-- Google Sheets Sync -->
      <div class="sheets-sync-row">
        <div class="sheets-sync-left">
          <span class="sheets-icon">⬡</span>
          <span class="sheets-label">Google Sheets Sync</span>
          <span class="sheets-desc">NCA master template is saved to Google Sheets and loaded automatically on every visit.</span>
        </div>
        <div class="sheets-sync-right">
          <!-- status badge -->
          <span v-if="!sheetsUrl" class="sync-badge sync-badge-off">Not configured</span>
          <span v-else-if="sheetsStatus === 'syncing'" class="sync-badge sync-badge-syncing">⟳ Syncing...</span>
          <span v-else-if="sheetsStatus === 'ok'" class="sync-badge sync-badge-ok">✓ Connected</span>
          <span v-else-if="sheetsStatus === 'error'" class="sync-badge sync-badge-error">✕ Connection failed</span>
          <!-- inline URL input -->
          <template v-if="showSheetsInput">
            <input
              v-model="sheetsUrlInput"
              class="sheets-url-input"
              placeholder="Paste Apps Script Web App URL here..."
              @keyup.enter="saveSheetsUrl"
              @keyup.escape="cancelSheetsConfig"
            />
            <button @click="saveSheetsUrl" class="btn btn-success btn-sm">Save</button>
            <button @click="cancelSheetsConfig" class="btn btn-ghost-danger btn-sm">Cancel</button>
          </template>
          <template v-else>
            <button v-if="sheetsUrl" @click="loadNcaFromSheets" class="btn btn-outline btn-sm">↻ Sync Now</button>
            <button @click="openSheetsConfig" class="btn btn-outline-nca btn-sm">
              {{ sheetsUrl ? 'Change URL' : '⚙ Configure' }}
            </button>
          </template>
        </div>
      </div>

    </div>

    <!-- ═══ INVENTORY TABLE CARD ═══ -->
    <div class="card">
      <div class="table-card-header">
        <div class="card-heading">
          <span class="card-title-icon">▤</span>
          <h2 class="card-title">Inventory Status</h2>
          <span v-if="displayParts.length" class="row-count">{{ displayParts.length }} items</span>
          <span v-if="minStockStatus === 'nca'" class="nca-fallback-tag">
            Min stock from {{ ncaWarehouseName }}
          </span>
        </div>
        <button v-if="displayParts.length" @click="downloadPurchaseCSV" class="btn btn-primary">
          Generate Purchase Order
        </button>
      </div>

      <div v-if="displayParts.length" class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Part Code</th>
              <th>Part Name</th>
              <th class="num-col">Shelf Qty</th>
              <th class="num-col">Min Qty</th>
              <th>Alert Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in displayParts"
              :key="item.code"
              :class="item.warn50 ? 'row-urgent' : ''"
            >
              <td class="code-cell">{{ item.code }}</td>
              <td>{{ item.name }}</td>
              <td class="num-col">{{ item.qty }}</td>
              <td class="num-col">{{ item.minQty }}</td>
              <td>
                <span v-if="item.fromMinOnly" class="badge badge-urgent">
                  Restock Needed: {{ item.minQty }}
                </span>
                <template v-else>
                  <span
                    v-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty < item.minQty"
                    :class="item.warn50 ? 'badge badge-urgent' : 'badge badge-warn'"
                  >
                    <template v-if="item.warn50">Urgent +{{ item.minQty - item.qty }}</template>
                    <template v-else>Restock +{{ item.minQty - item.qty }}</template>
                  </span>
                  <span v-else-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty > item.minQty" class="badge badge-ok">
                    Surplus +{{ item.qty - item.minQty }}
                  </span>
                  <span v-else-if="isNumber(item.qty) && isNumber(item.minQty)" class="badge badge-exact">
                    On Target
                  </span>
                  <span v-else class="badge badge-incomplete">Incomplete Data</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">📦</div>
        <p class="empty-text">
          No data available. Please upload the minimum stock file or current inventory file to view alert results.
        </p>
      </div>
    </div>

    <!-- ═══ BOTTOM ACTIONS ═══ -->
    <div class="bottom-actions">
      <button @click="showSummaryReport" class="btn btn-secondary">
        View All Warehouse Summary
      </button>
      <button @click="downloadAllWarehousesReport" class="btn btn-info">
        Export All Warehouse Report
      </button>
    </div>

  </div>
</template>

<script>
import * as XLSX from "xlsx";

const LS_KEYS = {
  warehousesList: 'warehousesList',
  allWarehouseData: 'allWarehouseData',
  currentWarehouse: 'currentWarehouseId',
};

export default {
  name: "PartsList",
  data() {
    return {
      currentWarehouse: 'warehouse1',
      warehouses: [
        { id: 'warehouse1', name: 'NCA' },
        { id: 'warehouse2', name: 'HQ' },
        { id: 'warehouse3', name: 'IL' },
        { id: 'warehouse4', name: 'NTX' },
        { id: 'warehouse5', name: 'STX' },
        { id: 'warehouse6', name: 'HO' },
        { id: 'warehouse7', name: 'CO' },
        { id: 'warehouse8', name: 'YONG HANG' },
        { id: 'warehouse9', name: 'NJ' },
      ],
      warehouseData: {},
      minStockMap: {},   // own config for the current warehouse
      parts: [],
      nameMap: {},
      dirtyMin: false,
      dirtyParts: false,
      dirtyNames: false,
      // Google Sheets sync
      sheetsUrl: localStorage.getItem('nca_sheets_url') || '',
      sheetsStatus: 'idle', // 'idle' | 'syncing' | 'ok' | 'error'
      showSheetsInput: false,
      sheetsUrlInput: '',
    };
  },
  computed: {
    // ── NCA helpers ──────────────────────────────────────
    ncaId() {
      return this.warehouses.find(w => w.name === 'NCA')?.id || 'warehouse1';
    },
    ncaWarehouseName() {
      return this.warehouses.find(w => w.name === 'NCA')?.name || 'NCA';
    },

    // ── Min stock status for the current warehouse ───────
    // 'own'  → has its own uploaded config
    // 'nca'  → no own config but NCA has one → use NCA fallback
    // 'none' → neither own nor NCA has data
    minStockStatus() {
      if (Object.keys(this.minStockMap).length > 0) return 'own';
      if (this.currentWarehouse === this.ncaId) return 'none';
      const ncaMap = this.warehouseData[this.ncaId]?.minStockMap || {};
      return Object.keys(ncaMap).length > 0 ? 'nca' : 'none';
    },

    // Effective min stock: own config if present, else NCA's
    effectiveMinStockMap() {
      if (Object.keys(this.minStockMap).length > 0) return this.minStockMap;
      if (this.currentWarehouse === this.ncaId) return this.minStockMap;
      return this.warehouseData[this.ncaId]?.minStockMap || {};
    },

    hasMinStockData() {
      return Object.keys(this.effectiveMinStockMap).length > 0;
    },

    statusBarClass() {
      if (this.minStockStatus === 'own')  return 'status-ok';
      if (this.minStockStatus === 'nca')  return 'status-nca';
      return 'status-warn';
    },

    // ── Display table ─────────────────────────────────────
    displayParts() {
      const minMap = this.effectiveMinStockMap;
      const stockMap = {};

      for (const it of this.parts) {
        if (!it || !it.code) continue;
        const code = it.code;
        const qtyNum = this.isNumber(it.qty) ? it.qty : 0;
        const minNum = this.isNumber(it.minQty) ? it.minQty : (minMap[code] || 0);
        const warn50 = this.isNumber(minNum) && minNum > 0
          ? (qtyNum <= 0.5 * minNum) : false;
        stockMap[code] = {
          code,
          name: it.name || this.nameMap[code] || '',
          qty: qtyNum,
          minQty: minNum,
          fromMinOnly: false,
          warn50,
        };
      }

      const result = Object.values(stockMap);
      for (const code of Object.keys(minMap)) {
        if (!stockMap[code]) {
          const minNum = minMap[code] || 0;
          const warn50 = minNum > 0;
          result.push({
            code,
            name: this.nameMap[code]
              || this.warehouseData[this.ncaId]?.nameMap?.[code]
              || '',
            qty: 0,
            minQty: minNum,
            fromMinOnly: true,
            warn50,
          });
        }
      }

      result.sort((a, b) => {
        if (a.warn50 !== b.warn50) return a.warn50 ? -1 : 1;
        return String(a.code).localeCompare(String(b.code));
      });
      return result;
    }
  },
  watch: {
    currentWarehouse(newId, oldId) {
      if (oldId) this.persistIfDirty(oldId);
      localStorage.setItem(LS_KEYS.currentWarehouse, newId);
      this.loadWorkingSet(newId);
      this.dirtyMin = false;
      this.dirtyParts = false;
      this.dirtyNames = false;
    }
  },
  mounted() {
    this.loadWarehouses();
    this.loadAllWarehouseData();
    const savedId = localStorage.getItem(LS_KEYS.currentWarehouse);
    if (savedId && this.warehouses.some(w => w.id === savedId)) {
      this.currentWarehouse = savedId;
    } else {
      this.ensureValidCurrentWarehouse();
      localStorage.setItem(LS_KEYS.currentWarehouse, this.currentWarehouse);
    }
    this.loadWorkingSet(this.currentWarehouse);
    if (this.sheetsUrl) this.loadNcaFromSheets();
  },
  methods: {
    // ── Warehouse list persistence ────────────────────────
    loadWarehouses() {
      const stored = localStorage.getItem(LS_KEYS.warehousesList);
      if (stored) {
        try {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr) && arr.every(x => x && x.id && x.name)) {
            this.warehouses = arr;
          }
        } catch (e) {
          console.warn('Failed to parse warehouse list, using defaults.', e);
        }
      }
      if (!this.warehouses || this.warehouses.length === 0) {
        this.warehouses = [
          { id: 'warehouse1', name: 'NCA' },
          { id: 'warehouse2', name: 'HQ' },
          { id: 'warehouse3', name: 'IL' },
          { id: 'warehouse4', name: 'NTX' },
          { id: 'warehouse5', name: 'STX' },
          { id: 'warehouse6', name: 'HO' },
          { id: 'warehouse7', name: 'CO' },
          { id: 'warehouse8', name: 'YONG HANG' },
          { id: 'warehouse9', name: 'NJ' },
        ];
        this.saveWarehouses();
      }
    },
    saveWarehouses() {
      localStorage.setItem(LS_KEYS.warehousesList, JSON.stringify(this.warehouses));
    },
    ensureValidCurrentWarehouse() {
      const exists = this.warehouses.some(w => w.id === this.currentWarehouse);
      if (!exists && this.warehouses.length > 0) {
        this.currentWarehouse = this.warehouses[0].id;
      }
    },

    // ── Per-warehouse data persistence ───────────────────
    loadAllWarehouseData() {
      const stored = localStorage.getItem(LS_KEYS.allWarehouseData);
      if (stored) {
        try {
          this.warehouseData = JSON.parse(stored) || {};
        } catch (e) {
          console.error('Failed to load warehouse data:', e);
          this.warehouseData = {};
        }
      }
    },
    saveAllWarehouseData() {
      localStorage.setItem(LS_KEYS.allWarehouseData, JSON.stringify(this.warehouseData));
    },
    loadWorkingSet(warehouseId) {
      const data = this.warehouseData[warehouseId] || { minStockMap: {}, parts: [], nameMap: {} };
      this.minStockMap = { ...data.minStockMap };
      this.parts = [...data.parts];
      this.nameMap = { ...data.nameMap };
    },
    persistIfDirty(warehouseId) {
      if (this.dirtyMin || this.dirtyParts || this.dirtyNames) {
        const prev = this.warehouseData[warehouseId] || {};
        this.warehouseData[warehouseId] = {
          minStockMap: { ...(this.minStockMap || {}) },
          parts: [...(this.parts || [])],
          nameMap: { ...(prev.nameMap || {}), ...(this.nameMap || {}) }
        };
        this.saveAllWarehouseData();
        this.dirtyMin = false;
        this.dirtyParts = false;
        this.dirtyNames = false;
      }
    },

    // ── Excel column reader (case-insensitive, trims spaces) ─
    // Returns the first matching value from a row for any of the given header names.
    col(row, ...names) {
      // Build a lookup map of trimmed-lowercase key → original value (done once per call)
      const lower = {};
      for (const k of Object.keys(row)) {
        lower[k.trim().toLowerCase()] = row[k];
      }
      for (const name of names) {
        // Try exact match first
        if (row[name] !== undefined && row[name] !== '') return row[name];
        // Then case-insensitive trimmed match
        const v = lower[name.trim().toLowerCase()];
        if (v !== undefined && v !== '') return v;
      }
      return '';
    },

    // ── NCA template helpers ──────────────────────────────
    getNcaMinStockMap() {
      return { ...(this.warehouseData[this.ncaId]?.minStockMap || {}) };
    },
    getNcaNameMap() {
      return { ...(this.warehouseData[this.ncaId]?.nameMap || {}) };
    },

    // Apply NCA min stock to a single warehouse's stored data
    // (does NOT affect its parts / shelf quantities)
    _applyNcaMinStockToWarehouse(warehouseId) {
      const ncaMin  = this.getNcaMinStockMap();
      const ncaNames = this.getNcaNameMap();
      const existing = this.warehouseData[warehouseId] || { minStockMap: {}, parts: [], nameMap: {} };
      this.warehouseData[warehouseId] = {
        ...existing,
        minStockMap: ncaMin,
        // Merge names: keep warehouse-specific names, fill gaps from NCA
        nameMap: { ...ncaNames, ...existing.nameMap },
      };
    },

    // Button: apply NCA min stock to ALL other warehouses
    applyNcaToAll() {
      const ncaMin = this.getNcaMinStockMap();
      if (Object.keys(ncaMin).length === 0) {
        alert(`${this.ncaWarehouseName} has no minimum stock configuration yet. Please upload it first.`);
        return;
      }
      const count = this.warehouses.filter(w => w.id !== this.ncaId).length;
      if (!confirm(
        `Apply ${this.ncaWarehouseName} minimum stock configuration to all ${count} other warehouses?\n\n` +
        `This will overwrite any existing minimum stock settings for those warehouses.\n` +
        `Current inventory data will not be affected.`
      )) return;

      for (const wh of this.warehouses) {
        if (wh.id === this.ncaId) continue;
        this._applyNcaMinStockToWarehouse(wh.id);
      }
      this.saveAllWarehouseData();

      // Reload current warehouse if it was affected
      if (this.currentWarehouse !== this.ncaId) {
        this.loadWorkingSet(this.currentWarehouse);
        this.dirtyMin = false;
        this.dirtyParts = false;
        this.dirtyNames = false;
      }

      alert(`${this.ncaWarehouseName} minimum stock has been applied to all ${count} other warehouses.`);
    },

    // ── Utilities ─────────────────────────────────────────
    getCurrentWarehouseName() {
      const warehouse = this.warehouses.find(w => w.id === this.currentWarehouse);
      return warehouse ? warehouse.name : 'Unknown';
    },
    isNumber(v) {
      return typeof v === 'number' && !Number.isNaN(v);
    },

    // ── Warehouse CRUD ────────────────────────────────────
    addWarehouse() {
      const name = prompt('Enter new warehouse name:');
      if (name && name.trim()) {
        const newId = 'warehouse_' + Date.now();
        this.warehouses.push({ id: newId, name: name.trim() });
        this.saveWarehouses();

        // Inherit NCA min stock as default (only if NCA has data)
        const ncaMin = this.getNcaMinStockMap();
        const ncaNames = this.getNcaNameMap();
        this.warehouseData[newId] = {
          minStockMap: Object.keys(ncaMin).length > 0 ? ncaMin : {},
          parts: [],
          nameMap: Object.keys(ncaNames).length > 0 ? ncaNames : {},
        };
        this.saveAllWarehouseData();
        this.currentWarehouse = newId;
      }
    },
    renameWarehouse() {
      const warehouse = this.warehouses.find(w => w.id === this.currentWarehouse);
      if (warehouse) {
        const newName = prompt('Enter new name:', warehouse.name);
        if (newName && newName.trim()) {
          warehouse.name = newName.trim();
          this.saveWarehouses();
        }
      }
    },
    deleteWarehouse() {
      if (this.warehouses.length <= 1) {
        alert('At least one warehouse must remain.');
        return;
      }
      if (confirm(`Delete warehouse "${this.getCurrentWarehouseName()}"? All data will be permanently removed.`)) {
        delete this.warehouseData[this.currentWarehouse];
        this.warehouses = this.warehouses.filter(w => w.id !== this.currentWarehouse);
        this.saveWarehouses();
        this.saveAllWarehouseData();
        this.ensureValidCurrentWarehouse();
        localStorage.setItem(LS_KEYS.currentWarehouse, this.currentWarehouse);
        this.loadWorkingSet(this.currentWarehouse);
      }
    },

    // ── Upload / Clear ────────────────────────────────────
    handleMinStockUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const map = {};
        const nameByCode = {};
        json.forEach(row => {
          const code = String(this.col(row, "Part Code", "part code", "PartCode") ?? "").trim();
          let minQty = this.col(row, "Min Qty", "min qty", "MinQty", "minimum qty", "Min Stock");
          minQty = typeof minQty === "number" ? minQty : Number(String(minQty).replace(/\s/g, ""));
          if (code && !isNaN(minQty)) map[code] = minQty;
          const pname = String(this.col(row, "Part Name", "part name", "PartName", "description", "Description") ?? "").trim();
          if (code && pname) nameByCode[code] = pname;
        });

        this.minStockMap = map;
        this.nameMap = { ...this.nameMap, ...nameByCode };
        this.parts = this.parts.map(item => ({
          ...item,
          name: item.name || this.nameMap[item.code] || '',
          minQty: this.minStockMap[item.code] || 0
        }));

        this.dirtyMin = true;
        this.dirtyParts = true;
        this.dirtyNames = true;
        this.persistIfDirty(this.currentWarehouse);

        // If NCA, sync to Google Sheets
        if (this.currentWarehouse === this.ncaId && this.sheetsUrl) {
          this.saveNcaToSheets();
        }

        alert(`Minimum stock file uploaded for warehouse: ${this.getCurrentWarehouseName()}`);
        e.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    },

    handleStockUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // Use effective min stock (own or NCA fallback) when mapping minQty
        const effectiveMin = this.effectiveMinStockMap;
        const localNameMap = { ...this.nameMap };
        const newParts = json.map(row => {
          const code = String(this.col(row, "Part Code", "part code", "PartCode") ?? "").trim();
          const name = String(this.col(row, "Part Name", "part name", "PartName", "description", "Description") ?? "").trim();
          const qty  = Number(this.col(row, "Shelf Qty", "shelf qty", "ShelfQty", "Qty", "qty", "Quantity", "quantity", "On Hand", "on hand"));
          if (code && name) localNameMap[code] = name;
          return { code, name, qty, minQty: effectiveMin[code] || 0 };
        });

        this.parts = newParts;
        this.nameMap = localNameMap;
        this.dirtyParts = true;
        this.dirtyNames = true;
        this.persistIfDirty(this.currentWarehouse);
        e.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    },

    clearMinStock() {
      if (confirm(`Clear minimum stock configuration for "${this.getCurrentWarehouseName()}"?`)) {
        this.minStockMap = {};
        this.parts = this.parts.map(item => ({ ...item, minQty: 0 }));
        this.dirtyMin = true;
        this.dirtyParts = true;
        this.persistIfDirty(this.currentWarehouse);
        alert('Minimum stock configuration cleared.');
      }
    },

    clearStock() {
      if (confirm(`Clear current inventory for "${this.getCurrentWarehouseName()}"?`)) {
        this.parts = [];
        this.dirtyParts = true;
        this.persistIfDirty(this.currentWarehouse);
        alert('Current inventory cleared.');
      }
    },

    // ── Google Sheets Sync ────────────────────────────────
    openSheetsConfig() {
      this.sheetsUrlInput = this.sheetsUrl;
      this.showSheetsInput = true;
    },
    saveSheetsUrl() {
      this.sheetsUrl = this.sheetsUrlInput.trim();
      localStorage.setItem('nca_sheets_url', this.sheetsUrl);
      this.showSheetsInput = false;
      if (this.sheetsUrl) this.loadNcaFromSheets();
    },
    cancelSheetsConfig() {
      this.showSheetsInput = false;
    },

    async loadNcaFromSheets() {
      if (!this.sheetsUrl) return;
      this.sheetsStatus = 'syncing';
      try {
        const res = await fetch(this.sheetsUrl);
        const json = await res.json();
        if (json.status === 'ok' && Array.isArray(json.data)) {
          const minMap = {};
          const nameMap = {};
          for (const row of json.data) {
            const code = String(row['Part Code'] || '').trim();
            const name  = String(row['Part Name'] || '').trim();
            const minQty = Number(row['Min Qty']);
            if (code && !isNaN(minQty)) minMap[code] = minQty;
            if (code && name) nameMap[code] = name;
          }
          const ncaExisting = this.warehouseData[this.ncaId] || { parts: [], nameMap: {} };
          this.warehouseData[this.ncaId] = {
            ...ncaExisting,
            minStockMap: minMap,
            nameMap: { ...ncaExisting.nameMap, ...nameMap },
          };
          this.saveAllWarehouseData();
          if (this.currentWarehouse === this.ncaId) {
            this.loadWorkingSet(this.ncaId);
            this.dirtyMin = false;
            this.dirtyParts = false;
            this.dirtyNames = false;
          }
          this.sheetsStatus = 'ok';
        } else {
          this.sheetsStatus = 'error';
        }
      } catch (e) {
        console.error('Google Sheets load failed:', e);
        this.sheetsStatus = 'error';
      }
    },

    async saveNcaToSheets() {
      if (!this.sheetsUrl) return;
      const ncaData  = this.warehouseData[this.ncaId] || {};
      const minMap   = ncaData.minStockMap || {};
      const nameMap  = ncaData.nameMap || {};
      const rows = Object.entries(minMap).map(([code, minQty]) => ({
        'Part Code': code,
        'Part Name': nameMap[code] || '',
        'Min Qty': minQty,
      }));
      try {
        await fetch(this.sheetsUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: rows }),
        });
        this.sheetsStatus = 'ok';
      } catch (e) {
        console.error('Google Sheets save failed:', e);
        this.sheetsStatus = 'error';
      }
    },

    // ── Template Downloads ────────────────────────────────
    downloadNcaTemplate() {
      const ncaMin  = this.warehouseData[this.ncaId]?.minStockMap || {};
      const ncaNames = this.warehouseData[this.ncaId]?.nameMap || {};

      if (Object.keys(ncaMin).length === 0) {
        alert(`${this.ncaWarehouseName} has no minimum stock data yet. Please upload it first.`);
        return;
      }

      const rows = Object.entries(ncaMin).map(([code, minQty]) => [
        code,
        ncaNames[code] || '',
        minQty,
      ]);
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      const ws = XLSX.utils.aoa_to_sheet([
        ["Part Code", "Part Name", "Min Qty"],
        ...rows,
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${this.ncaWarehouseName} Min Stock`);
      XLSX.writeFile(wb, `${this.ncaWarehouseName}_Min_Stock_Data.xlsx`);
    },

    downloadMinStockTemplate() {
      const ws = XLSX.utils.aoa_to_sheet([
        ["Part Code", "Part Name", "Min Qty"],
        ["EXAMPLE-001", "Example Part Name", 10],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Min Stock Template");
      XLSX.writeFile(wb, "Minimum_Stock_Template.xlsx");
    },

    downloadStockTemplate() {
      const ws = XLSX.utils.aoa_to_sheet([
        ["Part Code", "Part Name", "Shelf Qty"],
        ["EXAMPLE-001", "Example Part Name", 25],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory Template");
      XLSX.writeFile(wb, "Current_Inventory_Template.xlsx");
    },

    // ── Export ────────────────────────────────────────────
    downloadPurchaseCSV() {
      const header = ["Warehouse", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "Restock Qty", "Status"];

      const rows = this.displayParts
        .filter(item => this.isNumber(item.qty) && this.isNumber(item.minQty) && item.qty < item.minQty)
        .map(item => {
          const qty = Number(item.qty);
          const minQty = Number(item.minQty);
          const needQty = minQty - qty;
          const status = item.warn50 ? 'Urgent' : 'Restock';
          return [
            this.getCurrentWarehouseName(),
            item.code || '',
            item.name || '',
            qty,
            minQty,
            needQty,
            status
          ];
        });

      if (rows.length === 0) {
        alert("No parts require restocking in this warehouse.");
        return;
      }

      const csvContent = [header, ...rows].map(row =>
        row.map(field => {
          const str = String(field);
          return (str.includes(',') || str.includes('\n') || str.includes('"'))
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
        }).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${this.getCurrentWarehouseName()}_Purchase_Order.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    },

    showSummaryReport() {
      alert('Summary report feature coming soon.');
    },

    // Returns effective min stock for any warehouse (own → NCA fallback)
    getEffectiveMinStockForWarehouse(warehouseId) {
      const ownMap = this.warehouseData[warehouseId]?.minStockMap || {};
      if (Object.keys(ownMap).length > 0) return ownMap;
      if (warehouseId === this.ncaId) return ownMap;
      return this.warehouseData[this.ncaId]?.minStockMap || {};
    },

    mergePartsForWarehouse(warehouseId) {
      const data = this.warehouseData[warehouseId] || { minStockMap: {}, parts: [], nameMap: {} };
      const minMap = this.getEffectiveMinStockForWarehouse(warehouseId);
      const nm = {
        ...(this.warehouseData[this.ncaId]?.nameMap || {}),
        ...(data.nameMap || {}),
      };
      const stock = Array.isArray(data.parts) ? data.parts : [];

      const byCode = {};
      for (const it of stock) {
        if (!it || !it.code) continue;
        const code = String(it.code).trim();
        if (!code) continue;
        const qty = Number(it.qty);
        const minQty = (typeof it.minQty === 'number' && !Number.isNaN(it.minQty))
          ? it.minQty
          : (typeof minMap[code] === 'number' ? minMap[code] : 0);
        byCode[code] = {
          code,
          name: it.name || nm[code] || '',
          qty: (typeof qty === 'number' && !Number.isNaN(qty)) ? qty : 0,
          minQty,
          fromMinOnly: false
        };
      }
      for (const codeRaw of Object.keys(minMap)) {
        const code = String(codeRaw).trim();
        if (!code) continue;
        if (!byCode[code]) {
          const minQty = Number(minMap[code]);
          byCode[code] = {
            code,
            name: nm[code] || '',
            qty: 0,
            minQty: (typeof minQty === 'number' && !Number.isNaN(minQty)) ? minQty : 0,
            fromMinOnly: true
          };
        } else {
          const minQty = Number(minMap[code]);
          byCode[code].minQty = (typeof minQty === 'number' && !Number.isNaN(minQty))
            ? minQty : byCode[code].minQty;
        }
      }

      const result = Object.values(byCode);
      result.sort((a, b) => String(a.code).localeCompare(String(b.code)));
      return result;
    },

    downloadAllWarehousesReport() {
      try {
        if (!Array.isArray(this.warehouses) || this.warehouses.length === 0) {
          alert('No warehouse data available to export.');
          return;
        }

        const header = ["Warehouse", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "Restock Qty", "Status"];
        const allRows = [];

        for (const wh of this.warehouses) {
          if (!wh || !wh.id) continue;
          const merged = this.mergePartsForWarehouse(wh.id);
          if (!Array.isArray(merged)) continue;

          for (const item of merged) {
            const qty = Number(item.qty);
            const minQty = Number(item.minQty);
            const isQtyNum = typeof qty === 'number' && !Number.isNaN(qty);
            const isMinNum = typeof minQty === 'number' && !Number.isNaN(minQty);
            const needQty = (isQtyNum && isMinNum && qty < minQty) ? (minQty - qty) : 0;

            let status = 'Incomplete Data';
            if (isQtyNum && isMinNum) {
              if (qty < minQty) {
                status = (qty <= 0.5 * minQty) ? `Urgent +${needQty}` : `Restock +${needQty}`;
              } else if (qty > minQty) {
                status = 'Sufficient';
              } else {
                status = 'On Target';
              }
            } else if (!isQtyNum && isMinNum && minQty > 0) {
              status = `Urgent +${minQty}`;
            }

            allRows.push([
              wh.name || wh.id,
              item.code || '',
              item.name || '',
              isQtyNum ? qty : '',
              isMinNum ? minQty : '',
              needQty,
              status
            ]);
          }
        }

        if (allRows.length === 0) {
          alert("No data available to export.");
          return;
        }

        const csvContent = [header, ...allRows].map(row =>
          row.map(field => {
            const str = String(field);
            return (str.includes(',') || str.includes('\n') || str.includes('"'))
              ? '"' + str.replace(/"/g, '""') + '"'
              : str;
          }).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "All_Warehouses_Inventory_Report.csv";
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error('Export failed:', err);
        alert('Export failed. Please check the console for details.');
      }
    }
  }
};
</script>

<style scoped>
/* ── Reset & base ─────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

.app-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #1a1a2e;
  background: #f0f2f7;
  min-height: 100vh;
  padding: 24px 32px 48px;
  max-width: 1400px;
  margin: 0 auto;
}

/* ── Header ───────────────────────────────────────────── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  background: #1a1a2e;
  color: #fff;
  border-radius: 12px;
  padding: 20px 28px;
  margin-bottom: 16px;
}

.header-title h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #fff;
}

.header-sub {
  font-size: 12px;
  color: #8892b0;
  margin-top: 2px;
  display: block;
}

.warehouse-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.control-label {
  font-size: 13px;
  color: #8892b0;
  white-space: nowrap;
}

.warehouse-select {
  padding: 7px 12px;
  border-radius: 7px;
  border: 1px solid #3a3a5c;
  background: #2a2a4a;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  outline: none;
  min-width: 140px;
}
.warehouse-select:focus { border-color: #4f8ef7; }

/* ── Status bar ───────────────────────────────────────── */
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-radius: 9px;
  margin-bottom: 16px;
  font-size: 14px;
  border: 1px solid transparent;
}
.status-ok   { background: #edfaf3; border-color: #a3e6c3; color: #1a5c38; }
.status-nca  { background: #eff6ff; border-color: #93c5fd; color: #1e40af; }
.status-warn { background: #fff8e6; border-color: #ffd77a; color: #7a4e00; }

.status-warehouse { flex: 1; }
.status-warehouse strong { font-weight: 600; }

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.status-badge-ok  { background: #c6f6dd; color: #1a5c38; }
.status-badge-nca { background: #dbeafe; color: #1e40af; }
.status-badge-warn { background: #ffe9a0; color: #7a4e00; }

/* ── Cards ────────────────────────────────────────────── */
.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e8f0;
  padding: 20px 24px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.card-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #eef2ff;
  border-radius: 7px;
  font-size: 13px;
  color: #4f6ef7;
  flex-shrink: 0;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a2e;
}

.row-count {
  font-size: 12px;
  color: #8892b0;
  background: #f0f2f7;
  padding: 2px 8px;
  border-radius: 10px;
}

.nca-fallback-tag {
  font-size: 11px;
  color: #1e40af;
  background: #dbeafe;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

/* ── Import grid ──────────────────────────────────────── */
.import-grid {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
}

.import-section {
  flex: 1;
  min-width: 260px;
  padding: 4px 16px 4px 0;
}
.import-section:last-child {
  padding-left: 24px;
  padding-right: 0;
}

.import-divider {
  width: 1px;
  align-self: stretch;
  background: #e4e8f0;
  margin: 0 8px;
  flex-shrink: 0;
}

.import-section-label {
  font-size: 12px;
  font-weight: 600;
  color: #8892b0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.file-btn-wrapper {
  cursor: pointer;
  display: inline-block;
}
.file-input-hidden { display: none; }

/* ── Bulk action row ──────────────────────────────────── */
.bulk-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e4e8f0;
}

.bulk-action-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bulk-action-label {
  font-size: 12px;
  font-weight: 700;
  color: #1e40af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bulk-action-desc {
  font-size: 12px;
  color: #8892b0;
  max-width: 540px;
  line-height: 1.5;
}

.bulk-action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

/* ── Table card header ────────────────────────────────── */
.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.table-card-header .card-heading { margin-bottom: 0; }

/* ── Data table ───────────────────────────────────────── */
.table-wrapper {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #e4e8f0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.data-table thead tr { background: #f7f8fc; }

.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #5a6480;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid #e4e8f0;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f2f7;
  vertical-align: middle;
}

.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: #f7f8fc; }
.data-table tbody tr.row-urgent { background: #fff5f5; }
.data-table tbody tr.row-urgent:hover { background: #ffe9e9; }

.num-col {
  text-align: right;
  font-variant-numeric: tabular-nums;
  width: 100px;
}

.code-cell {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  color: #3a3a5c;
  font-weight: 500;
}

/* ── Badges ───────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-urgent     { background: #fee2e2; color: #991b1b; }
.badge-warn       { background: #fef3c7; color: #92400e; }
.badge-ok         { background: #d1fae5; color: #065f46; }
.badge-exact      { background: #e0f2fe; color: #0369a1; }
.badge-incomplete { background: #f1f5f9; color: #94a3b8; }

/* ── Empty state ──────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: #94a3b8;
}
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-text {
  font-size: 14px;
  max-width: 480px;
  margin: 0 auto;
  line-height: 1.6;
}

/* ── Bottom actions ───────────────────────────────────── */
.bottom-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ── Buttons ──────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border-radius: 7px;
  border: none;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s, transform 0.1s;
  text-decoration: none;
}
.btn:active { transform: scale(0.97); }
.btn:hover  { opacity: 0.88; }

.btn-sm { padding: 6px 12px; font-size: 13px; }

.btn-primary     { background: #4f6ef7; color: #fff; }
.btn-success     { background: #10b981; color: #fff; }
.btn-warning     { background: #f59e0b; color: #fff; }
.btn-danger      { background: #ef4444; color: #fff; }
.btn-secondary   { background: #64748b; color: #fff; }
.btn-info        { background: #06b6d4; color: #fff; }
.btn-nca         { background: #1e40af; color: #fff; }
.btn-outline-nca {
  background: transparent;
  color: #1e40af;
  border: 1.5px solid #1e40af;
}

/* ── Google Sheets Sync row ───────────────────────────── */
.sheets-sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 16px;
  background: #f8faff;
  border: 1px solid #dbeafe;
  border-radius: 8px;
}

.sheets-sync-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sheets-icon {
  font-size: 16px;
  color: #1e40af;
}

.sheets-label {
  font-size: 13px;
  font-weight: 700;
  color: #1e40af;
  white-space: nowrap;
}

.sheets-desc {
  font-size: 12px;
  color: #8892b0;
  max-width: 480px;
}

.sheets-sync-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sheets-url-input {
  padding: 6px 10px;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  font-size: 13px;
  width: 320px;
  outline: none;
  color: #1a1a2e;
}
.sheets-url-input:focus { border-color: #3b82f6; }

.sync-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.sync-badge-off     { background: #f1f5f9; color: #94a3b8; }
.sync-badge-syncing { background: #dbeafe; color: #1e40af; }
.sync-badge-ok      { background: #d1fae5; color: #065f46; }
.sync-badge-error   { background: #fee2e2; color: #991b1b; }
.btn-outline {
  background: transparent;
  color: #4f6ef7;
  border: 1.5px solid #4f6ef7;
}
.btn-ghost-danger {
  background: transparent;
  color: #ef4444;
  border: 1.5px solid #fca5a5;
}
.btn-ghost-danger:hover { background: #fee2e2; opacity: 1; }
</style>
