// MQTT Configuration
const MQTT_CONFIG = {
    broker: '192.168.5.1',
    port: 1883,
    clientId: 'webClient_' + Math.random().toString(16).substr(2, 8),
    topic: '#'
};

// Khai báo charts 
const charts = {};
let mqttClient = null;

// Khởi tạo kết nối MQTT
function connectMQTT() {
    console.log('Connecting to MQTT broker...');
    mqttClient = new Paho.MQTT.Client(
        MQTT_CONFIG.broker,
        MQTT_CONFIG.port,
        MQTT_CONFIG.clientId
    );

    mqttClient.onConnectionLost = onConnectionLost;
    mqttClient.onMessageArrived = onMessageArrived;

    mqttClient.connect({
        onSuccess: onConnect,
        onFailure: onFailure,
        keepAliveInterval: 60
    });
}

function onConnect() {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe(MQTT_CONFIG.topic);
    updateConnectionStatus('Connected');
}

function onMessageArrived(message) {
    try {
        const data = JSON.parse(message.payloadString);
        console.log('Received data:', data);
        updateWatchR1Values(data);
    } catch (error) {
        console.error('Error parsing message:', error);
    }
}

// Cập nhật bảng WatchR1 với dữ liệu mới từ MQTT
//----------------------------------------------------------------------------------------------
function updateWatchR1Values(data) {
    const table = document.querySelector('.table1 tbody');
    if (!table) {
        console.error('Table not found');
        return;
    }

    try {
        // Convert existing table rows to a map for quick lookup
        const existingRows = new Map();
        Array.from(table.rows).forEach(row => {
            const key = row.cells[0].textContent.trim();
            existingRows.set(key, row);
        });

        // Process each item from JSON data
        Object.entries(data).forEach(([key, value]) => {
            let row;
            
            // Check if row already exists
            if (existingRows.has(key)) {
                // Use existing row
                row = existingRows.get(key);
                existingRows.delete(key); // Remove from map to track unused rows
            } else {
                // Create new row if it doesn't exist
                row = table.insertRow();
                const cellName = row.insertCell(0);
                const cellValue = row.insertCell(1); // Chỉ còn 2 cột: Name và Value
                
                cellName.textContent = key;
            }

            // Update value cell
            const cellValue = row.cells[1];
            const formattedValue = typeof value === 'number' ? 
                value.toFixed(2) : value;

            // Only update and animate if value has changed
            if (cellValue.textContent !== String(formattedValue)) {
                cellValue.textContent = formattedValue;
                cellValue.classList.remove('updated');
                void cellValue.offsetWidth; // Force reflow for animation
                cellValue.classList.add('updated');
            }
        });

        // Keep existing rows that weren't in the new data
        // They might be updated in future messages
        console.log(`Table updated with ${Object.keys(data).length} values`);

    } catch (error) {
        console.error('Error updating table:', error);
    }
}
//----------------------------------------------------------------------------------------------

function updateConnectionStatus(status) {
    const statusElement = document.getElementById('wifi-status');
    
    if (!statusElement) return;
    
    // Update text and class based on status
    statusElement.textContent = status;
    
    // Remove all status classes
    statusElement.classList.remove('connected', 'disconnected', 'connecting', 'error');
    
    // Add appropriate class
    switch(status.toLowerCase()) {
        case 'connected':
            statusElement.classList.add('connected');
            break;
        case 'disconnected':
            statusElement.classList.add('disconnected');
            break;
        case 'connecting...':
            statusElement.classList.add('connecting');
            break;
        case 'error':
        case 'connection failed':
            statusElement.classList.add('error');
            break;
        default:
            // No class for unknown status
            break;
    }
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log('Connection lost:', responseObject.errorMessage);
        updateConnectionStatus('Disconnected');
        setTimeout(connectMQTT, 5000);
    }
}

function onFailure(error) {
    console.error('Failed to connect:', error);
    updateConnectionStatus('Connection Failed');
}

// Cập nhật CSS cho hiệu ứng cập nhật giá trị
const style = document.createElement('style');
style.textContent = `
    .mqtt-status {
        padding: 8px 16px;
        border-radius: 4px;
        margin: 10px;
        font-weight: bold;
    }
    .mqtt-status.connected {
        background-color: #4CAF50;
        color: white;
    }
    .mqtt-status.disconnected,
    .mqtt-status.failed {
        background-color: #f44336;
        color: white;
    }
    .updated {
        animation: highlight 1s ease-out;
    }
    @keyframes highlight {
        0% { background-color: #4CAF50; color: white; }
        100% { background-color: transparent; }
    }
`;
document.head.appendChild(style);

// Object để lưu trữ các biểu đồ

// Hàm tạo màu ngẫu nhiên
function generateRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Thêm biến để quản lý timer và dữ liệu
let graphTimers = {};
let graphData = {};
const MAX_DATA_POINTS = 50; // Số điểm tối đa hiển thị trên đồ thị khi đang ghi dữ liệu
// Thêm biến để theo dõi thời gian
let graphStartTimes = {}; // Lưu thời điểm bắt đầu cho mỗi biểu đồ
// Thêm biến để lưu dữ liệu log từ Start đến Stop
let graphLogData = {}; // Lưu dữ liệu log cho mỗi biểu đồ
// Thêm biến để theo dõi trạng thái hiển thị đồ thị
let graphDisplayMode = {}; // 'live' hoặc 'full'

// Sửa hàm addValueToGraph
function addValueToGraph(graphContainer, valname) {
    const chartId = graphContainer.querySelector('canvas').id;
    const chart = charts[chartId];

    if (!chart) {
        console.error(`Chart with ID ${chartId} not found.`);
        return;
    }

    // Kiểm tra trong bảng
    const table = document.querySelector('.table1 tbody');
    let foundInTable = false;
    
    if (table) {
        Array.from(table.rows).forEach(row => {
            const name = row.cells[0].textContent.trim();
            if (name.toLowerCase() === valname.toLowerCase()) {
                foundInTable = true;
            }
        });
    }
    
    if (!foundInTable) {
        alert(`Vui lòng chọn một giá trị có trong bảng WatchR1`);
        return;
    }

    // Kiểm tra xem giá trị đã được thêm vào biểu đồ chưa
    if (graphData[chartId] && graphData[chartId][valname]) {
        alert(`Giá trị ${valname} đã được thêm vào biểu đồ này`);
        return;
    }

    const color = generateRandomColor();
    const initialData = Array(MAX_DATA_POINTS).fill(null);
    
    // Thêm dataset mới với tên chính xác từ bảng
    chart.data.datasets.push({
        label: valname,
        data: initialData,
        borderColor: color,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.4
    });
    
    // Lưu thông tin dataset
    if (!graphData[chartId]) {
        graphData[chartId] = {};
    }
    graphData[chartId][valname] = {
        datasetIndex: chart.data.datasets.length - 1
    };
    
    chart.update();
    console.log(`Added new dataset to chart ${chartId} for ${valname}`);
    alert(`Đã thêm ${valname} vào biểu đồ. Bấm Start để bắt đầu vẽ biểu đồ.`);
}

// Hàm lấy giá trị từ bảng WatchR1
function getWatchR1Values() {
    const values = {};
    const table = document.querySelector('.table1 tbody');
    if (table) {
        Array.from(table.rows).forEach(row => {
            // Lấy tên chính xác (cả chữ hoa, chữ thường)
            const name = row.cells[0].textContent.trim();
            const value = row.cells[1].textContent.trim();
            values[name] = value;
            
            // Debug: hiển thị giá trị đang đọc
            console.log(`Reading value from table: ${name} = ${value}`);
        });
    }
    return values;
}

// Update the updateGraph function for faster updates
function updateGraph(chartId) {
    const chart = charts[chartId];
    if (!chart || !graphData[chartId]) return;

    const currentValues = getWatchR1Values();
    let hasNewData = false;
    
    // Tính thời gian đã trôi qua từ lúc bắt đầu (tính bằng giây)
    const currentTime = graphStartTimes[chartId] ? 
        ((Date.now() - graphStartTimes[chartId]) / 1000).toFixed(1) + 's' : 
        '0.0s';
    
    // Kiểm tra xem có dataset nào trong graphData[chartId] không
    if (Object.keys(graphData[chartId]).length === 0) {
        console.log(`No datasets added to graph ${chartId}. Add a value before starting.`);
        return;
    }
    
    // Chuẩn bị dữ liệu cho log nếu cần
    if (graphTimers[chartId] && !graphLogData[chartId]) {
        graphLogData[chartId] = {
            labels: [],
            datasets: {}
        };
        
        // Khởi tạo datasets cho từng loại dữ liệu
        Object.keys(graphData[chartId]).forEach(valname => {
            graphLogData[chartId].datasets[valname] = [];
        });
    }
    
    Object.entries(graphData[chartId]).forEach(([valname, info]) => {
        const value = currentValues[valname];
        if (value !== undefined && value !== '--') {
            const dataset = chart.data.datasets[info.datasetIndex];
            const numValue = parseFloat(value);
            
            if (!isNaN(numValue)) {
                // Push new value - làm tròn đến 2 chữ số thập phân
                const roundedValue = parseFloat(numValue.toFixed(2));
                dataset.data.push(roundedValue);
                if (dataset.data.length > MAX_DATA_POINTS) {
                    dataset.data.shift();
                }
                
                // Lưu giá trị vào log data nếu đang ghi log - cũng làm tròn đến 2 chữ số thập phân
                if (graphTimers[chartId] && graphLogData[chartId]) {
                    graphLogData[chartId].datasets[valname].push(roundedValue);
                }
                
                hasNewData = true;
            }
        }
    });

    if (hasNewData) {
        // Cập nhật nhãn trục thời gian bằng số giây đã trôi qua
        chart.data.labels.push(currentTime);
        if (chart.data.labels.length > MAX_DATA_POINTS) {
            chart.data.labels.shift();
        }
        
        // Lưu nhãn thời gian vào log data
        if (graphTimers[chartId] && graphLogData[chartId]) {
            graphLogData[chartId].labels.push(currentTime);
        }

        // Sử dụng requestAnimationFrame để cập nhật mượt hơn
        requestAnimationFrame(() => {
            chart.update('none'); // Sử dụng 'none' mode để cập nhật nhanh nhất
        });
    }
}

// Hàm xử lý sự kiện cho biểu đồ mặc định
function setupDefaultGraph(graphId, containerSelector) {
    const graphContainer = document.querySelector(containerSelector);
    const okButton = graphContainer.querySelector('.okbutton button');

    if (!graphContainer || !okButton) {
        console.error(`Default graph container or OK button not found for ${graphId}`);
        return;
    }

    // Thêm sự kiện cho nút OK
    okButton.addEventListener('click', () => {
        const valnameInput = graphContainer.querySelector('#valname');
        //const addressInput = graphContainer.querySelector('#address');
        const valname = valnameInput.value.trim();
        //const address = addressInput.value.trim();

        if (valname /* && address */) {
            addValueToGraph(graphContainer.querySelector('.graph-container'), valname/*, address */);
            valnameInput.value = '';
            //addressInput.value = '';
        } else {
            alert('Vui lòng nhập cả tên giá trị và địa chỉ.');
        }
    });

    // Tạo biểu đồ mặc định
    charts[graphId] = createChart(graphId);
}

// Simplified addNewSubgraph function
function addNewSubgraph() {
    console.log('Adding new subgraph');
    
    // Get container and calculate new graph number
    const container = document.querySelector('.subgraph1');
    const graphCount = container.querySelectorAll('.subgraph1_1').length + 1;
    
    // Create new graph element
    const newGraph = document.createElement('div');
    newGraph.className = 'subgraph1_1';
    const graphId = `myLineChart_${graphCount}`;
    
    // Set innerHTML with unique IDs and delete button
    newGraph.innerHTML = `
        <div class="graphUI">
            <button class="delete-graph-btn" title="Delete Graph">×</button>
            <div class="graph-container">
                <canvas id="${graphId}"></canvas>
            </div>
            <div class="addvalsbutton">
                <div class="addvalgraph">
                    <div class="input-field">
                        <label for="valname_${graphCount}">#Valname</label>
                        <input type="text" id="valname_${graphCount}" placeholder="Enter value name">
                    </div>
                </div>
                <div class="okbutton">
                    <button>OK</button>
                </div>
            </div>
            <div class="exbutton">
                <ul>
                    <li>Start</li>
                    <li>Stop</li>
                    <li>Reset</li>
                    <li>Export CSV file</li>
                </ul>
            </div>
        </div>
    `;
    
    // Append new graph to container
    container.appendChild(newGraph);
    
    // Initialize the new chart
    charts[graphId] = createChart(graphId);
    
    // Set up event listeners for the new graph
    setupGraphEventListeners(newGraph, graphId);
    
    // Add delete button event listener
    const deleteBtn = newGraph.querySelector('.delete-graph-btn');
    deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this graph?')) {
            // Destroy chart instance
            if (charts[graphId]) {
                charts[graphId].destroy();
                delete charts[graphId];
            }
            // Remove graph element
            newGraph.remove();
            console.log(`Deleted graph with ID: ${graphId}`);
        }
    });
    
    console.log(`Created new graph with ID: ${graphId}`);
}

// Add new function to export chart data to CSV
function exportToCSV(chartId) {
    const chart = charts[chartId];
    if (!chart) {
        console.error(`Chart ${chartId} not found`);
        return;
    }

    // Kiểm tra xem có dữ liệu log không
    if (!graphLogData[chartId] || graphLogData[chartId].labels.length === 0) {
        alert("Không có dữ liệu log nào được ghi lại. Vui lòng bấm Start và sau đó Stop để ghi lại dữ liệu.");
        console.log("No log data available for export");
        return;
    }

    // Lấy dữ liệu log đã lưu từ Start đến Stop
    const logData = graphLogData[chartId];
    const timestamps = logData.labels;
    const datasets = logData.datasets;

    // Chuẩn bị header của CSV
    let csvContent = 'Timestamp';
    Object.keys(datasets).forEach(datasetName => {
        csvContent += ',' + datasetName;
    });
    csvContent += '\n';

    // Thêm các hàng dữ liệu
    for (let i = 0; i < timestamps.length; i++) {
        // Thêm timestamp
        csvContent += timestamps[i];
        
        // Thêm giá trị từ mỗi dataset
        Object.keys(datasets).forEach(datasetName => {
            const dataValues = datasets[datasetName];
            if (i < dataValues.length && dataValues[i] !== null) {
                // Đảm bảo xuất giá trị với 2 chữ số thập phân
                const formattedValue = parseFloat(dataValues[i]).toFixed(2);
                csvContent += ',' + formattedValue;
            } else {
                csvContent += ',';
            }
        });
        csvContent += '\n';
    }

    // Tạo và kích hoạt tải xuống
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, '-');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `log_data_${chartId}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`Exported ${timestamps.length} log records to CSV file`);
}

// Update setupGraphEventListeners to include CSV export
function setupGraphEventListeners(graphDiv, graphId) {
    const okButton = graphDiv.querySelector('.okbutton button');
    const startButton = graphDiv.querySelector('.exbutton li:nth-child(1)');
    const stopButton = graphDiv.querySelector('.exbutton li:nth-child(2)');
    const resetButton = graphDiv.querySelector('.exbutton li:nth-child(3)');
    const exportButton = graphDiv.querySelector('.exbutton li:nth-child(4)'); // Export CSV button

    if (okButton) {
        okButton.addEventListener('click', () => {
            const valnameInput = graphDiv.querySelector(`input[id^="valname"]`);
            const valname = valnameInput?.value.trim();

            if (valname) {
                addValueToGraph(graphDiv.querySelector('.graph-container'), valname);
                valnameInput.value = '';
            } else {
                alert('Vui lòng nhập tên giá trị.');
            }
        });
    }

    if (startButton) {
        startButton.addEventListener('click', () => {
            console.log(`Attempting to start graph ${graphId}`);
            
            // Kiểm tra dataset
            if (!graphData[graphId] || Object.keys(graphData[graphId]).length === 0) {
                alert("Vui lòng thêm ít nhất một giá trị vào biểu đồ trước khi bấm Start");
                return;
            }
            
            // Reset dữ liệu khi bắt đầu mới
            const chart = charts[graphId];
            if (chart) {
                // Reset dữ liệu
                chart.data.labels = Array(MAX_DATA_POINTS).fill('');
                chart.data.datasets.forEach(dataset => {
                    dataset.data = Array(MAX_DATA_POINTS).fill(null);
                });
                
                // Reset các biến trạng thái
                graphStartTimes[graphId] = Date.now();
                graphLogData[graphId] = {
                    labels: [],
                    datasets: {}
                };
                
                // Khởi tạo lại datasets cho log
                Object.keys(graphData[graphId]).forEach(valname => {
                    graphLogData[graphId].datasets[valname] = [];
                });
                
                // Cập nhật đồ thị
                chart.update();
                
                // Bắt đầu timer
                if (!graphTimers[graphId]) {
                    graphTimers[graphId] = setInterval(() => updateGraph(graphId), 100);
                    console.log(`Started timer for graph ${graphId}`);
                }
            }
        });
    }

    if (stopButton) {
        stopButton.addEventListener('click', () => {
            if (graphTimers[graphId]) {
                // Dừng timer
                clearInterval(graphTimers[graphId]);
                delete graphTimers[graphId];
                console.log(`Stopped timer for graph ${graphId}`);
                
                // Lưu trạng thái dừng
                if (graphLogData[graphId] && graphLogData[graphId].labels.length > 0) {
                    const numDataPoints = graphLogData[graphId].labels.length;
                    console.log(`Saved ${numDataPoints} data points for graph ${graphId}`);
                    
                    // Hiển thị toàn bộ dữ liệu đã thu thập
                    displayFullGraph(graphId);
                    
                    alert(`Đã dừng ghi dữ liệu. Tổng số điểm dữ liệu: ${numDataPoints}`);
                }
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            const chart = charts[graphId];
            if (chart) {
                // Dừng timer nếu đang chạy
                if (graphTimers[graphId]) {
                    clearInterval(graphTimers[graphId]);
                    delete graphTimers[graphId];
                }
                
                // Reset dữ liệu đồ thị
                chart.data.labels = Array(MAX_DATA_POINTS).fill('');
                chart.data.datasets.forEach(dataset => {
                    dataset.data = Array(MAX_DATA_POINTS).fill(null);
                });
                
                // Reset tất cả biến trạng thái
                delete graphStartTimes[graphId];
                delete graphLogData[graphId];
                graphDisplayMode[graphId] = 'live';
                
                // Reset tùy chọn hiển thị
                chart.options.scales.x = {
                    animation: { duration: 0 }
                };
                
                // Cập nhật đồ thị
                chart.update();
                console.log(`Reset graph ${graphId} completely`);
            }
        });
    }

    if (exportButton) {
        exportButton.addEventListener('click', () => {
            exportToCSV(graphId);
            console.log(`Exporting CSV for graph ${graphId}`);
        });
    }
}

// Hàm tạo biểu đồ
function createChart(canvasId) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            elements: {
                point: {
                    radius: 0,
                    hitRadius: 10,
                    hoverRadius: 5
                },
                line: {
                    tension: 0.4,
                    borderWidth: 2
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    animation: {
                        duration: 0 // Remove scale animations
                    }
                },
                x: {
                    animation: {
                        duration: 0 // Remove scale animations
                    }
                }
            },
            animation: {
                duration: 0 // Remove all animations
            },
            plugins: {
                legend: {
                    labels: {
                        boxWidth: 2 // Smaller legend items
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
            }
        }
    });
    
    return chart;
}
//====================================================================================================================
// Hàm tải dữ liệu từ file JSON và điền vào bảng WatchR1
function loadDataFromJSON() {
    fetch('test.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const table1Body = document.querySelector('.table1 tbody');
            if (!table1Body) {
                console.error('Không tìm thấy bảng WatchR1.');
                return;
            }
            // Xóa dữ liệu cũ nếu cần
            table1Body.innerHTML = '';
            // Lặp qua từng phần tử trong mảng dữ liệu
            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${item.variable}</td><td>${item.address}</td><td>${item.value}</td>`;
                table1Body.appendChild(tr);
            });
        })
        .catch(error => console.error('Lỗi khi tải dữ liệu JSON:', error));
}

// Update initialize function
function initialize() {
    console.log('Initializing application...');
    
    // Set up add graph button
    const addButton = document.querySelector('.addgraphbutton button');
    if (addButton) {
        addButton.addEventListener('click', addNewSubgraph);
        console.log('Add graph button initialized');
    } else {
        console.error('Add graph button not found!');
    }
    
    // Initialize first graph
    const firstChart = document.getElementById('myLineChart_1');
    if (firstChart) {
        charts['myLineChart_1'] = createChart('myLineChart_1');
        setupGraphEventListeners(document.querySelector('.subgraph1_1'), 'myLineChart_1');
        console.log('First chart initialized');
    } else {
        console.error('First chart element not found!');
    }

    // Thiết lập sự kiện cho phần chọn topic
    setupTopicSelection();
    console.log('Topic selection initialized');
}

// Make sure we have the charts object defined
if (typeof charts === 'undefined') {
    const charts = {};
}

// Cập nhật phần khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, initializing application...');
    
    // Hiển thị cấu trúc DOM để debug
    console.log('Topic select element:', document.getElementById('topic'));
    console.log('Connect button:', document.getElementById('connect-button'));
    console.log('Disconnect button:', document.getElementById('disconnect-button'));
    
    // Khởi tạo ứng dụng
    initialize();
    initWebSocket();
    
    // Kiểm tra kết nối WebSocket sau một khoảng thời gian ngắn
    setTimeout(() => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('WebSocket connection confirmed active');
        } else {
            console.error('WebSocket not connected or not initialized properly');
        }
    }, 2000);
});

// WebSocket variables
let websocket;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Add this function to update the IP address display
function updateIPAddress() {
    // Get the current hostname or use default IP
    const host = window.location.hostname || '192.168.5.1';
    document.getElementById('ip-address').textContent = host;
}

// Enhanced connection status update function
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('wifi-status');
    
    if (!statusElement) return;
    
    // Update text and class based on status
    statusElement.textContent = status;
    
    // Remove all status classes
    statusElement.classList.remove('connected', 'disconnected', 'connecting', 'error');
    
    // Add appropriate class
    switch(status.toLowerCase()) {
        case 'connected':
            statusElement.classList.add('connected');
            break;
        case 'disconnected':
            statusElement.classList.add('disconnected');
            break;
        case 'connecting...':
            statusElement.classList.add('connecting');
            break;
        case 'error':
        case 'connection failed':
            statusElement.classList.add('error');
            break;
        default:
            // No class for unknown status
            break;
    }
}

// Initialize WebSocket connection with better error handling
function initWebSocket() {
    try {
        // Update status to connecting
        updateConnectionStatus('Connecting...');
        
        // Get the current hostname or use default IP
        const host = window.location.hostname || '192.168.5.1';
        updateIPAddress(); // Update IP address display
        
        // Create WebSocket connection
        websocket = new WebSocket(`ws://${host}/ws`);
        
        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            if (websocket && websocket.readyState !== WebSocket.OPEN) {
                websocket.close();
                updateConnectionStatus('Connection Failed');
                
                // Try to reconnect after a delay
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    setTimeout(initWebSocket, 3000);
                }
            }
        }, 5000);
        
        // WebSocket open handler
        websocket.onopen = function() {
            clearTimeout(connectionTimeout);
            reconnectAttempts = 0;
            updateConnectionStatus('Connected');
            
            // Request the topic list from the server
            requestTopicList();
        };
        
        // WebSocket close handler
        websocket.onclose = function() {
            updateConnectionStatus('Disconnected');
            
            // Try to reconnect after a delay
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                reconnectAttempts++;
                setTimeout(initWebSocket, delay);
            }
        };
        
        // WebSocket message handler
        websocket.onmessage = onMessage;
        
        // WebSocket error handler
        websocket.onerror = function(error) {
            clearTimeout(connectionTimeout);
            updateConnectionStatus('Error');
        };
    } catch (error) {
        updateConnectionStatus('Error');
        console.error('WebSocket initialization error:', error);
    }
}

// Request the list of available topics
function requestTopicList() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            action: 'get_topics'
        }));
    }
}

// Add connect/disconnect button functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket when page loads
    updateIPAddress();
    initWebSocket();
    
    // Connect button event listener
    const connectButton = document.getElementById('connect-button');
    if (connectButton) {
        connectButton.addEventListener('click', function() {
            const topicSelect = document.getElementById('topic');
            if (topicSelect && topicSelect.value) {
                subscribeToTopic(topicSelect.value);
            } else {
                alert('Please select a topic first');
            }
        });
    }
    
    // Disconnect button event listener
    const disconnectButton = document.getElementById('disconnect-button');
    if (disconnectButton) {
        disconnectButton.addEventListener('click', function() {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                // Subscribe to # (all topics) which effectively resets the subscription
                subscribeToTopic('#');
                updateConnectionStatus('Connected (All Topics)');
            } else {
                alert('WebSocket is not connected');
            }
        });
    }
});

// Subscribe to a specific topic
function subscribeToTopic(topic) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            action: 'subscribe',
            topic: topic
        }));
        updateConnectionStatus(`Connected to ${topic}`);
    } else {
        updateConnectionStatus('Disconnected');
        alert('WebSocket is not connected. Please refresh the page.');
    }
}

// Process WebSocket messages
function onMessage(event) {
    try {
        const data = JSON.parse(event.data);
        
        // Handle topic list response
        if (data && data.type === 'topic_list') {
            if (Array.isArray(data.topics)) {
                populateTopicDropdown(data.topics);
            }
            return;
        }
        
        // Handle subscribe response
        if (data && data.type === 'subscribe_response') {
            if (data.status === 'success') {
                updateConnectionStatus(`Connected to ${data.topic}`);
            } else {
                updateConnectionStatus('Subscription failed');
            }
            return;
        }
        
        // Handle normal data messages
        updateWatchR1Values(data);
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

// Populate topic dropdown with available topics
function populateTopicDropdown(topics) {
    const topicSelect = document.getElementById('topic');
    if (!topicSelect) return;
    
    // Clear existing options
    topicSelect.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a topic';
    topicSelect.appendChild(defaultOption);
    
    // Add all topics
    topics.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic;
        option.textContent = topic;
        topicSelect.appendChild(option);
    });
}