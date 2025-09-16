<template>
  <div>
    <h2>配件数量预警 - 多仓库管理</h2>
    
    <!-- 仓库选择 -->
    <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
      <label style="font-weight: bold;">选择仓库：</label>
      <select v-model="currentWarehouse" style="margin-left: 8px; padding: 4px 8px;">
        <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">
          {{ warehouse.name }}
        </option>
      </select>
      <button @click="addWarehouse" style="margin-left: 8px; padding: 4px 8px; background-color: #28a745; color: white; border: none; border-radius: 4px;">添加仓库</button>
      <button @click="renameWarehouse" style="margin-left: 8px; padding: 4px 8px; background-color: #ffc107; color: black; border: none; border-radius: 4px;">重命名</button>
      <button @click="deleteWarehouse" style="margin-left: 8px; padding: 4px 8px; background-color: #dc3545; color: white; border: none; border-radius: 4px;">删除仓库</button>
    </div>

    <!-- 当前仓库信息 -->
    <div style="margin-bottom: 16px; padding: 8px; background-color: #e7f3ff; border-radius: 4px;">
      <strong>当前仓库：{{ getCurrentWarehouseName() }}</strong>
      <span v-if="hasMinStockData" style="color: green; margin-left: 16px;">✓ 已配置最低库存</span>
      <span v-else style="color: orange; margin-left: 16px;">⚠ 未配置最低库存</span>
    </div>

    <!-- 最低库存 -->
    <div style="margin-bottom:8px;">
      <label>上传最低库存配置：</label>
      <input type="file" accept=".xls,.xlsx" @change="handleMinStockUpload" />
      <button @click="clearMinStock" style="margin-left:8px;color:red;">清除最低库存配置</button>
    </div>
    
    <!-- 现有库存 -->
    <div style="margin-bottom:16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <label>上传现有库存：</label>
        <input type="file" accept=".xls,.xlsx" @change="handleStockUpload" />
        <button @click="clearStock" style="margin-left:8px; color:red;">清除现有库存</button>
      </div>
      <button v-if="displayParts.length" @click="downloadPurchaseCSV" style="background-color: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">生成采购单</button>
    </div>

    <!-- 合并后的展示（最低库存 ∪ 现有库存） -->
    <table v-if="displayParts.length" border="1" style="width:100%;margin-bottom:16px;">
      <thead>
        <tr>
          <th>Part Code</th>
          <th>Part Name</th>
          <th>Shelf Qty</th>
          <th>最低库存</th>
          <th>预警</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in displayParts" :key="item.code">
          <td>{{ item.code }}</td>
          <td>{{ item.name }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.minQty }}</td>
          <td>
  <!-- 无库存（只在最低库存中出现）时，直接显示需要补 minQty -->
  <span v-if="item.fromMinOnly" style="color:#d63384;">
    无库存需补{{ item.minQty }}
  </span>

  <!-- 其余情况按 qty 与 minQty 比较 -->
  <template v-else>
    <span v-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty < item.minQty" style="color:red;">
      需补{{ item.minQty - item.qty }}
    </span>
    <span v-else-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty > item.minQty" style="color:green;">
      超出{{ item.qty - item.minQty }}
    </span>
    <span v-else-if="isNumber(item.qty) && isNumber(item.minQty)">
      达标
    </span>
    <span v-else style="color:#999;">数据不完整</span>
  </template>
</td>

        </tr>
      </tbody>
    </table>
    <div v-else style="color:gray;">暂无数据：请上传最低库存配置或现有库存表以查看预警结果</div>

    <!-- 汇总报表 -->
    <div style="margin-top: 24px;">
      <button @click="showSummaryReport" style="background-color: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 8px;">查看所有仓库汇总</button>
      <button @click="downloadAllWarehousesReport" style="background-color: #17a2b8; color: white; border: none; padding: 8px 16px; border-radius: 4px;">导出全部仓库报表</button>
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
      // allWarehouseData: { [warehouseId]: { minStockMap, parts, nameMap } }
      warehouseData: {},
      // 当前仓库工作集
      minStockMap: {},
      parts: [],
      nameMap: {}, // 新增：持久化配件名称 code -> name
      // “脏标记”：只有在上传/清除时才保存，避免切仓误覆盖
      dirtyMin: false,
      dirtyParts: false,
      dirtyNames: false,
    };
  },
  computed: {
    hasMinStockData() {
      return Object.keys(this.minStockMap).length > 0;
    },
    // 展示与导出的合并列表（最低库存 ∪ 现有库存）
    displayParts() {
      const stockMap = {};
      for (const it of this.parts) {
        if (!it || !it.code) continue;
        const code = it.code;
        stockMap[code] = {
          code,
          name: it.name || this.nameMap[code] || '',
          qty: this.isNumber(it.qty) ? it.qty : 0,
          minQty: this.isNumber(it.minQty) ? it.minQty : (this.minStockMap[code] || 0),
          fromMinOnly: false
        };
      }
      const result = Object.values(stockMap);
      // 把最低库存里有、但库存里没有的编码补齐，并优先展示“无库存需补1”
      for (const code of Object.keys(this.minStockMap)) {
        if (!stockMap[code]) {
          result.push({
            code,
            name: this.nameMap[code] || '',
            qty: 0,
            minQty: this.minStockMap[code] || 0,
            fromMinOnly: true
          });
        }
      }
      result.sort((a, b) => String(a.code).localeCompare(String(b.code)));
      return result;
    }
  },
  watch: {
    // 不用 immediate，避免本地数据未加载就清空
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
  },
  methods: {
    // ---------- 仓库列表持久化 ----------
    loadWarehouses() {
      const stored = localStorage.getItem(LS_KEYS.warehousesList);
      if (stored) {
        try {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr) && arr.every(x => x && x.id && x.name)) {
            this.warehouses = arr;
          }
        } catch (e) {
          console.warn('解析本地仓库列表失败，使用默认列表。', e);
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

    // ---------- 各仓数据持久化 ----------
    loadAllWarehouseData() {
      const stored = localStorage.getItem(LS_KEYS.allWarehouseData);
      if (stored) {
        try {
          this.warehouseData = JSON.parse(stored) || {};
        } catch (e) {
          console.error('读取仓库数据失败:', e);
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
          nameMap: { ...(this.nameMap || {}), ...(prev.nameMap || {}) } // 合并保留历史名称
        };
        this.saveAllWarehouseData();
        this.dirtyMin = false;
        this.dirtyParts = false;
        this.dirtyNames = false;
      }
    },

    // ---------- 工具 ----------
    getCurrentWarehouseName() {
      const warehouse = this.warehouses.find(w => w.id === this.currentWarehouse);
      return warehouse ? warehouse.name : '未知仓库';
    },
    isNumber(v) {
      return typeof v === 'number' && !Number.isNaN(v);
    },

    // ---------- 仓库列表操作 ----------
    addWarehouse() {
      const name = prompt('请输入新仓库名称:');
      if (name && name.trim()) {
        const newId = 'warehouse_' + Date.now();
        this.warehouses.push({ id: newId, name: name.trim() });
        this.saveWarehouses();
        this.warehouseData[newId] = { minStockMap: {}, parts: [], nameMap: {} };
        this.saveAllWarehouseData();
        this.currentWarehouse = newId;
      }
    },
    renameWarehouse() {
      const warehouse = this.warehouses.find(w => w.id === this.currentWarehouse);
      if (warehouse) {
        const newName = prompt('请输入新名称:', warehouse.name);
        if (newName && newName.trim()) {
          warehouse.name = newName.trim();
          this.saveWarehouses();
        }
      }
    },
    deleteWarehouse() {
      if (this.warehouses.length <= 1) {
        alert('至少需要保留一个仓库');
        return;
      }
      if (confirm('确定要删除当前仓库吗？所有数据将被清除！')) {
        delete this.warehouseData[this.currentWarehouse];
        this.warehouses = this.warehouses.filter(w => w.id !== this.currentWarehouse);
        this.saveWarehouses();
        this.saveAllWarehouseData();
        this.ensureValidCurrentWarehouse();
        localStorage.setItem(LS_KEYS.currentWarehouse, this.currentWarehouse);
        this.loadWorkingSet(this.currentWarehouse);
      }
    },

    // ---------- 上传/清除 ----------
    handleMinStockUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const map = {};
        const nameByCode = {};
        json.forEach(row => {
          const code = row["Part Code"] ? String(row["Part Code"]).trim() : "";
          let minQty = row["Min Qty"];
          minQty = typeof minQty === "number" ? minQty : Number(String(minQty).replace(/\s/g, ""));
          if (code && !isNaN(minQty)) map[code] = minQty;
          const pname = row["Part Name"] ? String(row["Part Name"]).trim() : "";
          if (code && pname) nameByCode[code] = pname;
        });

        // 固定保存（除非下次再上传/清除）
        this.minStockMap = map;

        // 合并名称到 nameMap（保留旧名，新增或更新）
        this.nameMap = { ...this.nameMap, ...nameByCode };

        // 先补齐已有 parts 的名称和 minQty
        this.parts = this.parts.map(item => ({
          ...item,
          name: item.name || this.nameMap[item.code] || '',
          minQty: this.minStockMap[item.code] || 0
        }));

        this.dirtyMin = true;
        this.dirtyParts = true; // parts 的 min/name 变化也需要保存
        this.dirtyNames = true;
        this.persistIfDirty(this.currentWarehouse);

        alert(`${this.getCurrentWarehouseName()} 最低库存配置已上传并保存`);
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
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const localNameMap = { ...this.nameMap };
        const newParts = json.map(row => {
          const code = String(row["Part Code"] ?? "").trim();
          const name = String(row["Part Name"] ?? "").trim();
          const qty  = Number(row["Shelf Qty"]);
          if (code && name) localNameMap[code] = name; // 更新名称字典
          return { code, name, qty, minQty: this.minStockMap[code] || 0 };
        });

        this.parts = newParts;
        this.nameMap = localNameMap;

        this.dirtyParts = true;
        this.dirtyNames = true;
        this.persistIfDirty(this.currentWarehouse);

        // 按你的要求：现有库存上传后不弹提示
        e.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    },

    clearMinStock() {
      if (confirm(`确定要清除 ${this.getCurrentWarehouseName()} 的最低库存配置吗？`)) {
        this.minStockMap = {};
        this.parts = this.parts.map(item => ({ ...item, minQty: 0 }));
        this.dirtyMin = true;
        this.dirtyParts = true;
        this.persistIfDirty(this.currentWarehouse);
        alert('最低库存配置已清除并保存');
      }
    },

    clearStock() {
      if (confirm(`确定要清除 ${this.getCurrentWarehouseName()} 的现有库存吗？`)) {
        this.parts = [];
        this.dirtyParts = true;
        this.persistIfDirty(this.currentWarehouse);
        alert('现有库存已清除并保存');
      }
    },

    // ---------- 导出 ----------
    downloadPurchaseCSV() {
  const header = ["仓库", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "需补数量", "状态"];

  const rows = this.displayParts
    // 采购单只导出“需要补货”的项：qty < minQty（无库存的项 qty=0 会自然命中）
    .filter(item => this.isNumber(item.qty) && this.isNumber(item.minQty) && item.qty < item.minQty)
    .map(item => {
      const qty = Number(item.qty);
      const minQty = Number(item.minQty);
      const needQty = minQty - qty;
      const status = item.fromMinOnly ? `无库存需补${minQty}` : '需补货';
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
    alert("当前仓库暂无需要补货的配件");
    return;
  }

  const csvContent = [header, ...rows].map(row =>
    row.map(field => {
      const str = String(field);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${this.getCurrentWarehouseName()}_采购单.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
},


    showSummaryReport() {
      alert('汇总报表功能开发中...');
    },

   // 1) 合并某仓库的最低库存 ∪ 现有库存（带 fromMinOnly 标记）
mergePartsForWarehouse(warehouseId) {
  const data = this.warehouseData[warehouseId] || { minStockMap: {}, parts: [], nameMap: {} };
  const minMap = data.minStockMap || {};
  const nm = data.nameMap || {};
  const stock = Array.isArray(data.parts) ? data.parts : [];

  const byCode = {};
  // 先放现有库存
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
      name: (it.name || nm[code] || ''),
      qty: (typeof qty === 'number' && !Number.isNaN(qty)) ? qty : 0,
      minQty,
      fromMinOnly: false
    };
  }
  // 再补最低库存里有但库存里没有的
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
      // 确保 minQty 与最新 minMap 对齐
      const minQty = Number(minMap[code]);
      byCode[code].minQty = (typeof minQty === 'number' && !Number.isNaN(minQty)) ? minQty : byCode[code].minQty;
    }
  }

  const result = Object.values(byCode);
  result.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return result;
},

// 2) 导出全部仓库报表（含“无库存需补X”）
downloadAllWarehousesReport() {
  try {
    if (!Array.isArray(this.warehouses) || this.warehouses.length === 0) {
      alert('暂无仓库数据可导出');
      return;
    }

    const header = ["仓库", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "需补数量", "状态"];
    const allRows = [];

    for (const wh of this.warehouses) {
      if (!wh || !wh.id) continue;
      const merged = this.mergePartsForWarehouse(wh.id);
      if (!Array.isArray(merged)) continue;

      for (const item of merged) {
        const qty = Number(item.qty);
        const minQty = Number(item.minQty);

        const isQtyNum = (typeof qty === 'number' && !Number.isNaN(qty));
        const isMinNum = (typeof minQty === 'number' && !Number.isNaN(minQty));

        // 需补数量
        const needQty = (isQtyNum && isMinNum && qty < minQty) ? (minQty - qty) : 0;

        // 状态字符串
        let status = '数据不完整';
        if (isQtyNum && isMinNum) {
          if (item.fromMinOnly) {
            // 无现有库存记录：需补 = minQty
            status = `无库存需补${minQty}`;
          } else if (qty < minQty) {
            status = '需补货';
          } else if (qty > minQty) {
            status = '库存充足';
          } else {
            status = '达标';
          }
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
      alert("暂无数据可导出");
      return;
    }

    const csvContent = [header, ...allRows].map(row =>
      row.map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "全部仓库库存报表.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('导出报表失败：', err);
    alert('导出失败，请打开控制台查看错误信息。');
  }
},

  }
};
</script>

<style scoped>
/* 可按需补充样式 */
</style>
