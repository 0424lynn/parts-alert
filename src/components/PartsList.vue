<template>
  <div>
    <h2>配件数量预警</h2>
    <table border="1" style="width:100%;margin-bottom:16px;">
      <thead>
        <tr>
          <th>配件名称</th>
          <th>数量</th>
          <th>预警</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in parts" :key="item.name">
          <td>{{ item.name }}</td>
          <td>{{ item.count }}</td>
          <td>
            <span v-if="item.count < warningCount" style="color:red;">数量低于预警值</span>
            <span v-else>正常</span>
          </td>
        </tr>
      </tbody>
    </table>
    <label>
      预警阈值：
      <input type="number" v-model.number="warningCount" min="0" style="width:80px;" />
    </label>
    <button @click="downloadCSV" style="margin-left:16px;">下载预警数据</button>
  </div>
</template>

<script>
export default {
  name: "PartsList",
  data() {
    return {
      warningCount: 10,
      parts: [
        { name: "螺丝", count: 8 },
        { name: "垫片", count: 15 },
        { name: "弹簧", count: 5 },
        { name: "轴承", count: 20 }
      ]
    };
  },
  methods: {
    downloadCSV() {
      const header = ["配件名称", "数量", "预警"];
      const rows = this.parts.map(item => [
        item.name,
        item.count,
        item.count < this.warningCount ? "数量低于预警值" : "正常"
      ]);
      const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "配件预警.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }
};
</script>