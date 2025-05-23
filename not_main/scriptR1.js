/*** 
 * scriptR1.js - Phiên bản đơn giản của script.js 
 * Topic MQTT cố định là "R1/data" cho giám sát thiết bị R1
 ***/

// MQTT Configuration - Cấu hình cố định
const MQTT_CONFIG = {
    broker: '192.168.5.1',
    port: 1883,
    clientId: 'webClient_R1_' + Math.floor(Math.random() * 1000),
    topic: 'R1/data'  // Topic cố định cho R1
};

// Khai báo biến toàn cục
const charts = {};
let graphTimers = {};
let graphData = {};
let graphStartTimes = {};
let graphLogData = {};
let graphDisplayMode = {};
const MAX_DATA_POINTS = 50;
let websocket;
let simulationMode = false;

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    console.log('R1 Page loaded, initializing...');
    
    // Thêm CSS cần thiết
    addCSS();
    
    // Hiển thị thông tin MQTT cố định trong header
    displayFixedTopicInfo();
    
    // Khởi tạo WebSocket
    initWebSocket();
    
    // Khởi tạo biểu đồ đầu tiên sau một thời gian ngắn
    setTimeout(() => {
        initFirstChart();
        setupAddGraphButton();
    }, 500);
    
    // Kiểm tra kết nối sau 5 giây
    setTimeout(checkConnectionAndData, 5000);
});

// ===================== WEBSOCKET FUNCTIONS =====================

// Khởi tạo WebSocket
function initWebSocket() {
    console.log('Initializing WebSocket connection...');
    
    try {
        // Sử dụng hostname hiện tại hoặc mặc định
        const host = window.location.hostname || '192.168.5.1';
        websocket = new WebSocket(`ws://${host}/ws`);
        
        websocket.onopen = onOpen;
        websocket.onclose = onClose;
        websocket.onmessage = onMessage;
        websocket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            updateConnectionStatus('Error');
        };
        
        updateConnectionStatus('Connecting...');
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus('Error');
        
        // Nếu không thể tạo WebSocket, bắt đầu chế độ mô phỏng sau 2 giây
        setTimeout(startSimulationMode, 2000);
    }
}

// Khi kết nối WebSocket thành công
function onOpen(event) {
    console.log('WebSocket Connected!');
    updateConnectionStatus('Connected');
    
    // Tự động đăng ký với topic cố định
    subscribeToFixedTopic();
}

// Đăng ký topic cố định
function subscribeToFixedTopic() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const subscribeCommand = {
            action: 'subscribe',
            topic: MQTT_CONFIG.topic
        };
        
        websocket.send(JSON.stringify(subscribeCommand));
        console.log(`Automatically subscribing to fixed topic: ${MQTT_CONFIG.topic}`);
        
        // Hiển thị trạng thái đăng ký
        const topicElement = document.getElementById('fixed-topic');
        if (topicElement) {
            topicElement.style.color = '#FF9800'; // Đang kết nối
            topicElement.dataset.status = 'subscribing';
        }
    }
}

// Khi mất kết nối WebSocket
function onClose(event) {
    console.log('WebSocket Disconnected!');
    updateConnectionStatus('Disconnected');
    
    // Xóa trạng thái đăng ký
    const topicElement = document.getElementById('fixed-topic');
    if (topicElement) {
        topicElement.style.color = ''; // Màu mặc định
        topicElement.dataset.status = 'disconnected';
    }
    
    // Thử kết nối lại sau 3 giây
    setTimeout(initWebSocket, 3000);
}

// Khi nhận được tin nhắn WebSocket
function onMessage(event) {
    try {
        // Log data nhận được
        console.log('Received data:', event.data.substring(0, 100) + (event.data.length > 100 ? '...' : ''));
        const data = JSON.parse(event.data);
        
        // Kiểm tra loại tin nhắn
        if (data.type === 'topic_list') {
            console.log('Received topic list:', data.topics);
            return;
        }
        
        if (data.type === 'subscribe_response') {
            console.log(`Subscribed to topic ${data.topic}: ${data.success ? 'success' : 'failed'}`);
            
            // Cập nhật trạng thái topic
            updateTopicStatus(data.topic, data.success);
            return;
        }
        
        // Xử lý dữ liệu nhận được - kiểm tra nếu là object
        if (data && typeof data === 'object') {
            console.log('Processing data message:', data);
            updateWatchR1Table(data);
        }
        
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
        console.error('Raw message:', event.data);
    }
}

// Cập nhật trạng thái topic
function updateTopicStatus(topic, isSubscribed) {
    const fixedTopic = document.getElementById('fixed-topic');
    if (fixedTopic) {
        fixedTopic.textContent = topic;
        fixedTopic.style.color = isSubscribed ? '#4CAF50' : '#F44336';
        fixedTopic.dataset.status = isSubscribed ? 'subscribed' : 'failed';
    }
}

// Cập nhật bảng WatchR1 với dữ liệu mới
function updateWatchR1Table(data) {
    // Sửa selector để khớp với HTML
    const table = document.querySelector('.table1 tbody');
    if (!table) {
        console.error('Table not found with selector: .table1 tbody');
        return;
    }

    try {
        // Chuyển các hàng hiện có thành map để tìm kiếm nhanh
        const existingRows = new Map();
        Array.from(table.rows).forEach(row => {
            if (row.cells && row.cells.length >= 2) {
                const key = row.cells[0].textContent.trim();
                existingRows.set(key, row);
            }
        });

        // Xử lý từng mục trong dữ liệu JSON
        Object.entries(data).forEach(([key, value]) => {
            let row;
            
            // Kiểm tra hàng đã tồn tại
            if (existingRows.has(key)) {
                // Sử dụng hàng hiện có
                row = existingRows.get(key);
                existingRows.delete(key);
            } else {
                // Tạo hàng mới nếu chưa tồn tại
                row = table.insertRow();
                const cellName = row.insertCell(0);
                const cellValue = row.insertCell(1);
                
                cellName.textContent = key;
            }

            // Cập nhật ô giá trị
            const cellValue = row.cells[1];
            const formattedValue = typeof value === 'number' ? 
                value.toFixed(2) : value;

            // Chỉ cập nhật và tạo hiệu ứng khi giá trị thay đổi
            if (cellValue.textContent !== String(formattedValue)) {
                cellValue.textContent = formattedValue;
                cellValue.classList.remove('updated');
                void cellValue.offsetWidth; // Force reflow
                cellValue.classList.add('updated');
            }
        });

    } catch (error) {
        console.error('Error updating table:', error);
    }
}

// Hàm tạo biểu đồ mới
function createChart(canvasId) {
    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas element with ID ${canvasId} not found`);
            return null;
        }
        
        // Thiết lập canvas size để hiển thị đúng
        canvas.style.width = '100%';
        canvas.style.height = '300px';
        
        const ctx = canvas.getContext('2d');
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
                            duration: 0
                        }
                    },
                    x: {
                        animation: {
                            duration: 0
                        }
                    }
                },
                animation: {
                    duration: 0
                },
                plugins: {
                    legend: {
                        labels: {
                            boxWidth: 2,
                            font: {
                                size: 12
                            }
                        },
                        position: 'top'
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            }
        });
        
        return chart;
    } catch (error) {
        console.error(`Error creating chart ${canvasId}:`, error);
        return null;
    }
}

// Khởi tạo biểu đồ đầu tiên
function initFirstChart() {
    try {
        console.log('Initializing first chart');
        const firstChart = document.getElementById('myLineChart_1');
        if (!firstChart) {
            console.error('First chart canvas element not found!');
            return;
        }
        
        // Đảm bảo canvas có kích thước đúng
        firstChart.style.width = '100%';
        firstChart.style.height = '300px';
        
        const chart = createChart('myLineChart_1');
        if (chart) {
            charts['myLineChart_1'] = chart;
            const graphDiv = document.querySelector('.subgraph1_1');
            if (graphDiv) {
                setupGraphEventListeners(graphDiv, 'myLineChart_1');
                console.log('First chart initialized successfully');
            } else {
                console.error('Graph div subgraph1_1 not found');
            }
        } else {
            console.error('Failed to create first chart');
        }
    } catch (error) {
        console.error('Error initializing first chart:', error);
    }
}

// Bắt đầu chế độ mô phỏng khi không kết nối được
function startSimulationMode() {
    if (simulationMode) return;
    
    console.log('Starting simulation mode');
    simulationMode = true;
    updateConnectionStatus('Simulation');
    
    // Hiển thị thông báo
    const topicElement = document.getElementById('fixed-topic');
    if (topicElement) {
        topicElement.textContent = MQTT_CONFIG.topic + ' (Simulation)';
        topicElement.style.color = '#FF9800';
    }
    
    // Tạo dữ liệu mô phỏng và tự động cập nhật bảng
    window.simulationInterval = setInterval(() => {
        // Tạo dữ liệu mô phỏng
        const simulationData = {
            speed: Math.floor(Math.random() * 100),
            angle: Math.floor(Math.random() * 360),
            distance: Math.floor(80 + Math.random() * 40),
            battery: Math.floor(70 + Math.random() * 30),
            motor_left: Math.floor(Math.random() * 255),
            motor_right: Math.floor(Math.random() * 255),
            position_x: Math.floor(100 + Math.random() * 50),
            position_y: Math.floor(50 + Math.random() * 30),
            temperature: Math.floor(25 + Math.random() * 10),
            humidity: Math.floor(40 + Math.random() * 40)
        };
        
        // Cập nhật bảng với dữ liệu mô phỏng
        updateWatchR1Table(simulationData);
    }, 1000);
}