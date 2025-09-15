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

    <div style="margin-bottom:8px;">
      <label>上传最低库存配置：</label>
      <input type="file" accept=".xls,.xlsx" @change="handleMinStockUpload" />
      <button @click="clearMinStock" style="margin-left:8px;color:red;">清除最低库存配置</button>
    </div>
    
    <div style="margin-bottom:16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <label>上传现有库存：</label>
        <input type="file" accept=".xls,.xlsx" @change="handleStockUpload" />
        <button @click="clearStock" style="margin-left:8px; color:red;">清除现有库存</button>
      </div>
      
      <button v-if="parts.length" @click="downloadPurchaseCSV" style="background-color: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">生成采购单</button>
    </div>

    <table v-if="parts.length" border="1" style="width:100%;margin-bottom:16px;">
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
        <tr v-for="item in parts" :key="item.code">
          <td>{{ item.code }}</td>
          <td>{{ item.name }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.minQty }}</td>
          <td>
            <span v-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty < item.minQty" style="color:red;">
              需补{{ item.minQty - item.qty }}
            </span>
            <span v-else-if="isNumber(item.qty) && isNumber(item.minQty) && item.qty > item.minQty" style="color:green;">
              超出{{ item.qty - item.minQty }}
            </span>
            <span v-else-if="isNumber(item.qty) && isNumber(item.minQty)">
              刚好最低库存
            </span>
            <span v-else style="color:#999;">数据不完整</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else style="color:gray;">请为当前仓库上传库存表格后查看预警结果</div>

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
      // allWarehouseData: { [warehouseId]: { minStockMap, parts } }
      warehouseData: {},
      // 当前仓库工作集
      minStockMap: {},
      parts: [],
      // “脏标记”：只有在上传/清除时才保存，避免切仓误覆盖
      dirtyMin: false,
      dirtyParts: false,
    };
  },
  computed: {
    hasMinStockData() {
      return Object.keys(this.minStockMap).length > 0;
    }
  },
  watch: {
    // 注意：不再 immediate，避免在尚未加载本地数据前就把工作集置空
    currentWarehouse(newId, oldId) {
      // 保存上一个仓库（如果有真实变更）
      if (oldId) this.persistIfDirty(oldId);
      // 记住选择
      localStorage.setItem(LS_KEYS.currentWarehouse, newId);
      // 加载新仓库数据
      this.loadWorkingSet(newId);
      // 切仓后重置脏标记
      this.dirtyMin = false;
      this.dirtyParts = false;
    }
  },
  mounted() {
    // 1) 先恢复仓库列表
    this.loadWarehouses();
    // 2) 再恢复所有仓库数据
    this.loadAllWarehouseData();
    // 3) 恢复上次选中的仓库ID（若存在且有效）
    const savedId = localStorage.getItem(LS_KEYS.currentWarehouse);
    if (savedId && this.warehouses.some(w => w.id === savedId)) {
      this.currentWarehouse = savedId;
    } else {
      this.ensureValidCurrentWarehouse();
      localStorage.setItem(LS_KEYS.currentWarehouse, this.currentWarehouse);
    }
    // 4) 最关键：此时本地数据都加载好了，手动装载当前仓库的工作集
    this.loadWorkingSet(this.currentWarehouse);
  },
  methods: {
    clearStock() {
  if (confirm(`确定要清除 ${this.getCurrentWarehouseName()} 的现有库存吗？`)) {
    this.parts = [];
    this.dirtyParts = true;
    this.persistIfDirty(this.currentWarehouse);
    alert('现有库存已清除并保存');
  }
},
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
    // 加载某个仓的工作集到内存
    loadWorkingSet(warehouseId) {
      const data = this.warehouseData[warehouseId] || { minStockMap: {}, parts: [] };
      this.minStockMap = { ...data.minStockMap };
      this.parts = [...data.parts];
    },
    persistIfDirty(warehouseId) {
      // 只有在上传/清除操作后才保存，避免切仓“空数据”覆盖掉已有
      if (this.dirtyMin || this.dirtyParts) {
        this.warehouseData[warehouseId] = {
          minStockMap: { ...this.minStockMap },
          parts: [...this.parts],
        };
        this.saveAllWarehouseData();
        this.dirtyMin = false;
        this.dirtyParts = false;
      }
    },

    // ---------- 基础工具 ----------
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
        // 初始化数据容器
        this.warehouseData[newId] = { minStockMap: {}, parts: [] };
        this.saveAllWarehouseData();
        // 切到新仓（将触发 watcher -> 保存 oldId（若脏）并加载新仓）
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
        json.forEach(row => {
          const code = row["Part Code"] ? String(row["Part Code"]).trim() : "";
          let minQty = row["Min Qty"];
          minQty = typeof minQty === "number" ? minQty : Number(String(minQty).replace(/\s/g, ""));
          if (code && !isNaN(minQty)) map[code] = minQty;
        });

        // 固定保存（除非下次再上传/清除）
        this.minStockMap = map;
        // 与现有 parts 对齐 minQty
        this.parts = this.parts.map(item => ({
          ...item,
          minQty: this.minStockMap[item.code] || 0
        }));

        // 标记并持久化（当前仓）
        this.dirtyMin = true;
        this.dirtyParts = true; // parts 的 minQty 变化也需要保存
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

        // 覆盖当前仓的“现有库存”，并带上已固定的 minQty
        const newParts = json.map(row => {
          const code = String(row["Part Code"] ?? "").trim();
          const name = String(row["Part Name"] ?? "").trim();
          const qty  = Number(row["Shelf Qty"]);
          return { code, name, qty, minQty: this.minStockMap[code] || 0 };
        });

        this.parts = newParts;

        // 标记并持久化（当前仓）
        this.dirtyParts = true;
        this.persistIfDirty(this.currentWarehouse);

       
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

    // ---------- 导出 ----------
    downloadPurchaseCSV() {
      const header = ["仓库", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "需补数量"];
      const rows = this.parts
        .filter(item => this.isNumber(item.qty) && this.isNumber(item.minQty) && item.qty < item.minQty)
        .map(item => [this.getCurrentWarehouseName(), item.code, item.name, item.qty, item.minQty, item.minQty - item.qty]);

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

    downloadAllWarehousesReport() {
      const header = ["仓库", "Part Code", "Part Name", "Shelf Qty", "Min Qty", "需补数量", "状态"];
      const allRows = [];

      this.warehouses.forEach(warehouse => {
        const data = this.warehouseData[warehouse.id] || { parts: [] };
        data.parts.forEach(item => {
          const qty = Number(item.qty);
          const minQty = Number(item.minQty);
          const status = (this.isNumber(qty) && this.isNumber(minQty))
            ? (qty < minQty ? '需补货' : qty > minQty ? '库存充足' : '刚好达标')
            : '数据不完整';
          const needQty = (this.isNumber(qty) && this.isNumber(minQty) && qty < minQty) ? (minQty - qty) : 0;
          allRows.push([warehouse.name, item.code, item.name, qty, minQty, needQty, status]);
        });
      });

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
    },
  }
};
</script>

<style scoped>
/* 可按需补充样式 */
</style>
