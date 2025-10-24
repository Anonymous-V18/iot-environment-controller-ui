const DEFAULT_THRESHOLDS = {
  temp: 35,
  hum: 70,
  light: 300,
};

let mqttUser = "";
let mqttPass = "";
const brokerURL = "https://maqiatto.com:8883";

let topicData = () => `${mqttUser}/iot-env-controller`;
let topicControl = () => `${mqttUser}/control`;
let topicThresh = () => `${mqttUser}/thresholds`;
let topicAlerts = () => `${mqttUser}/alerts`;
let topicStatus = () => `${mqttUser}/status`;

let client = null;
let chart = null;
let chartData = {
  labels: [],
  datasets: [
    {
      label: "Nhiệt độ (°C)",
      data: [],
      borderColor: "#ef4444",
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      borderWidth: 2,
      fill: true,
      yAxisID: "y",
      tension: 0.4,
    },
    {
      label: "Độ ẩm (%)",
      data: [],
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59, 130, 246, 0.1)",
      borderWidth: 2,
      fill: true,
      yAxisID: "y1",
      tension: 0.4,
    },
    {
      label: "Ánh sáng (ADC)",
      data: [],
      borderColor: "#facc15",
      backgroundColor: "rgba(250, 204, 21, 0.1)",
      borderWidth: 2,
      fill: true,
      yAxisID: "y2",
      tension: 0.4,
    },
  ],
};

const maxPoints = 60;

const tempDisplay = document.getElementById("tempDisplay");
const humDisplay = document.getElementById("humDisplay");
const lightDisplay = document.getElementById("lightDisplay");
const logsEl = document.getElementById("logs");
const connStatus = document.getElementById("connStatus");
const infoAuto = document.getElementById("infoAuto");
const infoT = document.getElementById("infoT");
const infoH = document.getElementById("infoH");
const infoL = document.getElementById("infoL");

function addLog(msg, level = "info") {
  const time = new Date().toLocaleTimeString();
  const el = document.createElement("div");
  el.className = "log-entry";
  el.innerText = `[${time}] ${msg}`;
  if (level === "warn") el.classList.add("log-warn");
  if (level === "error") el.classList.add("log-error");
  if (level === "success") el.classList.add("log-success");
  logsEl.prepend(el);
}

function clearLogs() {
  logsEl.innerHTML = "";
  addLog("📝 Đã xóa nhật ký", "success");
}

function resetThresholds() {
  document.getElementById("thTemp").value = DEFAULT_THRESHOLDS.temp;
  document.getElementById("thHum").value = DEFAULT_THRESHOLDS.hum;
  document.getElementById("thLight").value = DEFAULT_THRESHOLDS.light;
  addLog("↺ Đã khôi phục giá trị mặc định", "success");
}

function initChart() {
  const ctx = document.getElementById("chart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      animation: { duration: 750 },
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "#cbd5e1",
            font: { size: 12 },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          ticks: { color: "#ef4444" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          ticks: { color: "#3b82f6" },
          grid: { drawOnChartArea: false },
        },
        y2: {
          type: "linear",
          display: false,
          position: "right",
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function connectMQTT() {
  mqttUser = document.getElementById("mqttUser").value.trim();
  mqttPass = document.getElementById("mqttPass").value.trim();
  if (!mqttUser || !mqttPass) {
    alert("Vui lòng nhập email và mật khẩu MQTT");
    return;
  }

  if (client && client.connected) {
    addLog("Đang ngắt kết nối cũ...", "warn");
    client.end();
  }

  addLog("Đang kết nối tới Maqiatto...");
  connStatus.innerText = "● Đang kết nối...";
  connStatus.className = "status-badge status-disconnected";

  const opts = { username: mqttUser, password: mqttPass, reconnectPeriod: 2000 };
  client = mqtt.connect(brokerURL, opts);

  client.on("connect", () => {
    addLog("✅ Kết nối thành công!", "success");
    connStatus.innerText = "● Đã kết nối";
    connStatus.className = "status-badge status-connected";

    client.subscribe(topicData(), (err) => {
      if (err) addLog("❌ Lỗi subscribe data", "error");
      else addLog("✓ Đã subscribe data topic", "success");
    });
    client.subscribe(topicAlerts(), (err) => {
      if (!err) addLog("✓ Đã subscribe alerts", "success");
    });
    client.subscribe(topicStatus(), (err) => {
      if (!err) addLog("✓ Đã subscribe status", "success");
    });
  });

  client.on("reconnect", () => {
    addLog("Đang kết nối lại...", "warn");
    connStatus.innerText = "● Đang kết nối lại...";
    connStatus.className = "status-badge status-disconnected";
  });

  client.on("error", (err) => {
    addLog("❌ Lỗi MQTT: " + err, "error");
    connStatus.innerText = "● Lỗi kết nối";
    connStatus.className = "status-badge status-disconnected";
  });

  client.on("message", (topic, payloadBuf) => {
    const payload = payloadBuf.toString();
    if (topic === topicData()) {
      try {
        const obj = JSON.parse(payload);
        updateReadings(obj);
      } catch (e) {
        addLog("⚠️ JSON không hợp lệ: " + payload, "warn");
      }
    } else if (topic === topicAlerts()) {
      addLog("🚨 CẢNH BÁO: " + payload, "warn");
    } else if (topic === topicStatus()) {
      try {
        const obj = JSON.parse(payload);
        if (obj.autoMode !== undefined) {
          infoAuto.innerText = obj.autoMode ? "BẬT" : "TẮT";
        }
        if (obj.tempThreshold !== undefined) {
          infoT.innerText = obj.tempThreshold + "°C";
          document.getElementById("thTemp").value = obj.tempThreshold;
        }
        if (obj.humThreshold !== undefined) {
          infoH.innerText = obj.humThreshold + "%";
          document.getElementById("thHum").value = obj.humThreshold;
        }
        if (obj.lightThreshold !== undefined) {
          infoL.innerText = obj.lightThreshold;
          document.getElementById("thLight").value = obj.lightThreshold;
        }
        addLog("📊 Cập nhật trạng thái");
      } catch (e) {
        addLog("Status: " + payload);
      }
    }
  });
}

function sendControl(cmd) {
  if (!client || !client.connected) {
    alert("Chưa kết nối MQTT!");
    return;
  }
  client.publish(topicControl(), cmd);
  addLog("📤 Gửi lệnh: " + cmd, "success");
}

function sendThresholds() {
  if (!client || !client.connected) {
    alert("Chưa kết nối MQTT!");
    return;
  }
  const t = parseFloat(document.getElementById("thTemp").value);
  const h = parseFloat(document.getElementById("thHum").value);
  const l = parseInt(document.getElementById("thLight").value);
  const payload = JSON.stringify({ temp: t, hum: h, light: l });
  client.publish(topicThresh(), payload);
  addLog("📤 Gửi ngưỡng: " + payload, "success");
  infoT.innerText = t + "°C";
  infoH.innerText = h + "%";
  infoL.innerText = l;
}

function updateReadings(obj) {
  const t = obj.temp;
  const h = obj.hum;
  const l = obj.light;

  tempDisplay.innerText = typeof t === "number" ? t.toFixed(1) : "--";
  humDisplay.innerText = typeof h === "number" ? h.toFixed(1) : "--";
  lightDisplay.innerText = typeof l === "number" ? l : "--";

  const now = new Date();
  chartData.labels.push(now.toLocaleTimeString());
  chartData.datasets[0].data.push(t);
  chartData.datasets[1].data.push(h);
  chartData.datasets[2].data.push(l);

  if (chartData.labels.length > maxPoints) {
    chartData.labels.shift();
    chartData.datasets.forEach((ds) => ds.data.shift());
  }
  chart.update();
}

document.getElementById("btnAutoOn").onclick = function () {
  if (!client || !client.connected) {
    alert("Chưa kết nối MQTT!");
    return;
  }
  client.publish(topicControl(), "AUTO_ON");
  infoAuto.innerText = "BẬT";
  addLog("⚙️ Bật chế độ AUTO", "success");
};

document.getElementById("btnAutoOff").onclick = function () {
  if (!client || !client.connected) {
    alert("Chưa kết nối MQTT!");
    return;
  }
  client.publish(topicControl(), "AUTO_OFF");
  infoAuto.innerText = "TẮT";
  addLog("⚙️ Tắt chế độ AUTO", "success");
};

initChart();

window.addEventListener("load", () => {
  infoT.innerText = document.getElementById("thTemp").value + "°C";
  infoH.innerText = document.getElementById("thHum").value + "%";
  infoL.innerText = document.getElementById("thLight").value;
  infoAuto.innerText = "—";
  addLog("🚀 Dashboard đã sẵn sàng");
});

window.connectMQTT = connectMQTT;
window.sendControl = sendControl;
window.sendThresholds = sendThresholds;
window.resetThresholds = resetThresholds;
window.clearLogs = clearLogs;
