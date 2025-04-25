// MQTT Configuration
const MQTT_CONFIG = {
    broker: '192.168.5.1',
    port: 1883,
    clientId: 'webClient_' + Math.random().toString(16).substr(2, 8),
    topic: 'Swerve_Robot/data'
};

// Khai báo charts một lần duy nhất
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

function updateWatchR1Values(data) {
    const table = document.querySelector('.table1 tbody');
    if (!table) return;

    // Map của giá trị và index trong bảng
    const valueMap = {
        'imu': 0,
        'encoder_x': 1,
        'encoder_y': 2
    };

    // Cập nhật từng giá trị
    Object.entries(data).forEach(([key, value]) => {
        const rowIndex = valueMap[key];
        if (rowIndex !== undefined) {
            const row = table.rows[rowIndex];
            if (row) {
                const valueCell = row.cells[2];
                // Format số thập phân nếu cần
                const formattedValue = typeof value === 'number' ? 
                    value.toFixed(2) : value;
                valueCell.textContent = formattedValue;
                
                // Thêm hiệu ứng highlight
                valueCell.classList.add('updated');
                setTimeout(() => valueCell.classList.remove('updated'), 1000);
            }
        }
    });
}

function updateConnectionStatus(status) {
    let statusDiv = document.querySelector('.mqtt-status');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.className = 'mqtt-status';
        document.querySelector('.headpara').appendChild(statusDiv);
    }
    
    statusDiv.textContent = `MQTT: ${status}`;
    statusDiv.className = `mqtt-status ${status.toLowerCase()}`;
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
const MAX_DATA_POINTS = 50; // Số điểm tối đa trên đồ thị

// Sửa hàm addValueToGraph
function addValueToGraph(graphContainer, valname, address) {
    const chartId = graphContainer.querySelector('canvas').id;
    const chart = charts[chartId];

    if (!chart) {
        console.error(`Chart with ID ${chartId} not found.`);
        return;
    }

    // Kiểm tra xem valname có trong bảng WatchR1 không
    const watchR1Values = getWatchR1Values();
    if (!watchR1Values[valname]) {
        alert('Vui lòng chọn giá trị từ bảng WatchR1');
        return;
    }

    const color = generateRandomColor();
    
    // Khởi tạo mảng dữ liệu rỗng
    const initialData = Array(MAX_DATA_POINTS).fill(null);
    
    // Thêm dataset mới
    chart.data.datasets.push({
        label: valname,
        data: initialData,
        borderColor: color,
        fill: false,
        pointRadius: 0,  // Remove points
        pointHoverRadius: 5,  // Show points on hover
        borderWidth: 2,  // Line thickness
        tension: 0.4  // Make lines smoother
    });
    
    // Lưu thông tin về dataset
    if (!graphData[chartId]) {
        graphData[chartId] = {};
    }
    graphData[chartId][valname] = {
        address: address,
        datasetIndex: chart.data.datasets.length - 1
    };
    
    chart.update();
    console.log(`Added new dataset to chart ${chartId} for ${valname}`);
}

// Hàm lấy giá trị từ bảng WatchR1
function getWatchR1Values() {
    const values = {};
    const table = document.querySelector('.table1 tbody');
    if (table) {
        Array.from(table.rows).forEach(row => {
            const name = row.cells[0].textContent;
            const value = row.cells[2].textContent;
            values[name] = value;
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
    
    Object.entries(graphData[chartId]).forEach(([valname, info]) => {
        const value = currentValues[valname];
        if (value !== undefined && value !== '--') {
            const dataset = chart.data.datasets[info.datasetIndex];
            const numValue = parseFloat(value);
            
            if (!isNaN(numValue)) {
                // Push new value
                dataset.data.push(numValue);
                if (dataset.data.length > MAX_DATA_POINTS) {
                    dataset.data.shift();
                }
                hasNewData = true;
            }
        }
    });

    if (hasNewData) {
        // Update time labels
        const currentTime = new Date().toLocaleTimeString();
        chart.data.labels.push(currentTime);
        if (chart.data.labels.length > MAX_DATA_POINTS) {
            chart.data.labels.shift();
        }

        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
            chart.update('none'); // Use 'none' mode for fastest updates
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
        const addressInput = graphContainer.querySelector('#address');
        const valname = valnameInput.value.trim();
        const address = addressInput.value.trim();

        if (valname && address) {
            addValueToGraph(graphContainer.querySelector('.graph-container'), valname, address);
            valnameInput.value = '';
            addressInput.value = '';
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
                    <div class="input-field">
                        <label for="address_${graphCount}">#Address</label>
                        <input type="text" id="address_${graphCount}" placeholder="Enter address">
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

// Add new function to setup graph event listeners
function setupGraphEventListeners(graphDiv, graphId) {
    const okButton = graphDiv.querySelector('.okbutton button');
    const startButton = graphDiv.querySelector('.exbutton li:nth-child(1)');
    const stopButton = graphDiv.querySelector('.exbutton li:nth-child(2)');
    const resetButton = graphDiv.querySelector('.exbutton li:nth-child(3)');

    if (okButton) {
        okButton.addEventListener('click', () => {
            const valnameInput = graphDiv.querySelector(`input[id^="valname"]`);
            const addressInput = graphDiv.querySelector(`input[id^="address"]`);
            const valname = valnameInput?.value.trim();
            const address = addressInput?.value.trim();

            if (valname && address) {
                addValueToGraph(graphDiv.querySelector('.graph-container'), valname, address);
                valnameInput.value = '';
                addressInput.value = '';
            } else {
                alert('Vui lòng nhập cả tên giá trị và địa chỉ.');
            }
        });
    }

    if (startButton) {
        startButton.addEventListener('click', () => {
            if (!graphTimers[graphId]) {
                // Initial update immediately
                updateGraph(graphId);
                // Then set interval for continuous updates
                graphTimers[graphId] = setInterval(() => updateGraph(graphId), 100); // Update every 100ms
                console.log(`Started timer for graph ${graphId}`);
            }
        });
    }

    if (stopButton) {
        stopButton.addEventListener('click', () => {
            if (graphTimers[graphId]) {
                clearInterval(graphTimers[graphId]);
                delete graphTimers[graphId];
                console.log(`Stopped timer for graph ${graphId}`);
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            const chart = charts[graphId];
            if (chart) {
                chart.data.labels = Array(MAX_DATA_POINTS).fill('');
                chart.data.datasets.forEach(dataset => {
                    dataset.data = Array(MAX_DATA_POINTS).fill(null);
                });
                chart.update();
                console.log(`Reset graph ${graphId}`);
            }
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
    if (!addButton) {
        console.error('Add graph button not found!');
        return;
    }
    
    addButton.addEventListener('click', addNewSubgraph);
    console.log('Add graph button initialized');
    
    // Initialize first graph
    const firstChart = document.getElementById('myLineChart_1');
    if (firstChart) {
        charts['myLineChart_1'] = createChart('myLineChart_1');
        setupGraphEventListeners(document.querySelector('.subgraph1_1'), 'myLineChart_1');
        console.log('First chart initialized');
    }
    
    // Connect to MQTT
    connectMQTT();
}

// Make sure we have the charts object defined
if (typeof charts === 'undefined') {
    const charts = {};
}

// Gọi hàm initialize khi trang đã load xong
document.addEventListener('DOMContentLoaded', initialize);



let websocket;

function initWebSocket() {
    console.log('Initializing WebSocket connection...');
    websocket = new WebSocket(`ws://${window.location.hostname}/ws`);
    websocket.onopen = onOpen;
    websocket.onclose = onClose;
    websocket.onmessage = onMessage;
}

function onOpen(event) {
    console.log('WebSocket Connected!');
}

function onClose(event) {
    console.log('WebSocket Disconnected!');
    setTimeout(initWebSocket, 2000);
}

function onMessage(event) {
    console.log('Raw message received:', event.data);
    try {
        const data = JSON.parse(event.data);
        console.log('Parsed data:', data);
        // Handle the data immediately
        updateWatchR1Table(data);
    } catch (error) {
        console.error('Error parsing message:', error);
    }
}

function updateWatchR1Table(data) {
    console.log('Updating table with data:', data);
    const table = document.querySelector('.table1 tbody');
    if (!table) {
        console.error('Table not found!');
        return;
    }

    const topicParts = data.topic.split('/');
    const topicType = topicParts[topicParts.length - 1];

    // Map topic to row index
    const topicMap = {
        'imu': 0,
        'encoder_x': 1,
        'encoder_y': 2
    };

    const rowIndex = topicMap[topicType];
    if (rowIndex !== undefined) {
        const row = table.rows[rowIndex];
        if (row) {
            const valueCell = row.cells[2];
            // Format number to 8 decimal places if it's a number
            const value = typeof data.value === 'number' ? 
                         data.value.toFixed(8) : 
                         data.value;
            valueCell.textContent = value;
            
            // Add highlight effect
            valueCell.classList.add('updated');
            setTimeout(() => valueCell.classList.remove('updated'), 1000);
            
            console.log(`Updated ${topicType} with value ${value}`);
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, initializing WebSocket...');
    initWebSocket();
});