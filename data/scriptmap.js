/**
 * Script để vẽ bản đồ vị trí robot
 * Sử dụng giá trị encoderX và encoderY từ dữ liệu JSON đã được lấy bởi script.js
 */

// Khai báo biến toàn cục cho map
let mapCanvas, mapCtx;
let canvasWidth, canvasHeight;
// Thay đổi từ mét sang milimet
const FIELD_WIDTH = 15000; // 15000mm thay vì 15m
const FIELD_HEIGHT = 8000; // 8000mm thay vì 8m
const ROBOT_RADIUS = 400;  // 400mm thay vì 0.4m
const PATH_HISTORY_MAX = 1000; // Số điểm tối đa trong lịch sử đường đi
let scaleX, scaleY;
let offsetX = 0, offsetY = 0;
let zoomLevel = 1;

// Vị trí robot và lịch sử đường đi
let robotPosition = { x: 0, y: 0 };
let pathHistory = [];
let totalDistance = 0;

// Thêm biến toàn cục để lưu topic hiện tại
let currentSelectedTopic = ""; // Rỗng nghĩa là nhận tất cả các topic

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo canvas
    initMap();
    
    // Thiết lập sự kiện cho các nút điều khiển
    document.getElementById('reset-btn').addEventListener('click', resetPath);
    document.getElementById('center-btn').addEventListener('click', centerView);
    document.getElementById('zoom-in-btn').addEventListener('click', () => changeZoom(1.2));
    document.getElementById('zoom-out-btn').addEventListener('click', () => changeZoom(0.8));
    
    // Thêm sự kiện cho các nút record
    document.getElementById('start-record-btn').addEventListener('click', startRecording);
    document.getElementById('stop-record-btn').addEventListener('click', stopRecording);
    document.getElementById('export-path-btn').addEventListener('click', exportPath);
    
    // Cập nhật IP từ nguồn hiện tại
    document.getElementById('ip-address').textContent = window.location.hostname;
    updateConnectionStatus('Connected');
    
    // Vẽ bản đồ ban đầu
    drawMap();
    
    // Thiết lập sự kiện để đón nhận dữ liệu mới
    setupDataListener();
    
    // Thêm sự kiện cho nút xác nhận topic
    document.getElementById('topic-confirm').addEventListener('click', applyTopicFilter);
    
    // Thêm sự kiện để nhấn Enter trong input cũng kích hoạt tìm kiếm
    document.getElementById('topic-input').addEventListener('keyup', function(event) {
        if (event.key === "Enter") {
            applyTopicFilter();
        }
    });
});

// Khởi tạo canvas bản đồ
function initMap() {
    mapCanvas = document.getElementById('position-map');
    if (!mapCanvas) {
        console.error('Canvas not found');
        return;
    }
    
    mapCtx = mapCanvas.getContext('2d');
    
    // Thiết lập kích thước canvas
    resizeCanvas();
    
    // Theo dõi sự kiện resize
    window.addEventListener('resize', resizeCanvas);
}

// Thiết lập lắng nghe dữ liệu mới
function setupDataListener() {
    console.log('Map: Setting up data listeners');
    
    // Phương thức 1: Đăng ký custom event từ script.js
    window.addEventListener('data-updated', function(event) {
        console.log('Map: Received data-updated event');
        const data = event.detail;
        processPositionData(data);
    });
    
    // Phương thức 2: Định nghĩa hàm cập nhật để script.js gọi trực tiếp
    window.updateMapData = function(data) {
        console.log('Map: updateMapData called with data:', data);
        processPositionData(data);
    };
    
    // Phương thức 3: Kiểm tra dữ liệu mới định kỳ
    setInterval(() => {
        if (window.lastReceivedData) {
            console.log('Map: Checking lastReceivedData:', window.lastReceivedData);
            processPositionData(window.lastReceivedData);
        }
    }, 1000); // Tăng lên 1000ms để giảm số lượng log
}

// Thêm hàm để áp dụng bộ lọc topic
function applyTopicFilter() {
    const topicInput = document.getElementById('topic-input');
    const newTopic = topicInput.value.trim();
    
    // Cập nhật biến global
    currentSelectedTopic = newTopic;
    
    // Cập nhật UI
    document.getElementById('current-topic').textContent = currentSelectedTopic || "ALL";
    
    // Reset đường đi khi thay đổi topic
    resetPath();
    
    console.log(`Topic filter applied: ${currentSelectedTopic || "ALL"}`);
}

// Xử lý dữ liệu vị trí từ JSON
function processPositionData(data) {
    if (!data) {
        console.log("Map: Dữ liệu nhận được là null hoặc undefined");
        return;
    }
    
    console.log("Map: Đã nhận dữ liệu mới:", data);
    
    // Kiểm tra topic
    if (data.topic) {
        console.log("Map: Topic của dữ liệu:", data.topic);
    } else {
        console.log("Map: Dữ liệu không có thông tin topic");
    }
    
    // Kiểm tra xem dữ liệu có đến từ topic đã chọn không
    if (currentSelectedTopic && data.topic) {
        // Chuyển cả hai sang chữ thường để tránh lỗi phân biệt hoa thường
        const normalizedFilter = currentSelectedTopic.toLowerCase();
        const normalizedTopic = data.topic.toLowerCase();
        
        console.log(`Map: Kiểm tra topic - Filter: ${normalizedFilter}, Data: ${normalizedTopic}`);
        
        // Kiểm tra cả hai chiều - topic có chứa filter hoặc filter có chứa topic
        if (!normalizedTopic.includes(normalizedFilter) && !normalizedFilter.includes(normalizedTopic)) {
            console.log(`Map: Topic không phù hợp với filter, bỏ qua dữ liệu`);
            return;
        }
    }
    
    // In ra toàn bộ thuộc tính của object để tìm encoder
    console.log("Map: Tất cả các thuộc tính trong dữ liệu:");
    for (const key in data) {
        console.log(`    ${key}: ${data[key]}`);
    }
    
    // Tìm giá trị encoder với nhiều tên khả dĩ hơn
    const encoderX = getValueFromJson(data, ['encoderX', 'EncoderX', 'positionX', 'PositionX', 'x', 'X', 'encoder_x', 'pos_x', 'px']);
    const encoderY = getValueFromJson(data, ['encoderY', 'EncoderY', 'positionY', 'PositionY', 'y', 'Y', 'encoder_y', 'pos_y', 'py']);
    
    console.log(`Map: Tìm thấy encoderX=${encoderX}, encoderY=${encoderY}`);
    
    if (encoderX !== null && encoderY !== null) {
        // Chuyển đổi an toàn sang số - giá trị đã là milimet, không cần nhân 1000
        const newX = safeParseFloat(encoderX);
        const newY = safeParseFloat(encoderY);
        
        console.log(`Map: Sau khi parse - X=${newX}mm, Y=${newY}mm`);
        
        // Kiểm tra giá trị hợp lệ - điều chỉnh giới hạn cho milimet
        if (!isNaN(newX) && !isNaN(newY) && Math.abs(newX) < 10000000 && Math.abs(newY) < 10000000) {
            robotPosition.x = newX;
            robotPosition.y = newY;
            
            // Cập nhật hiển thị vị trí - hiển thị theo mm
            updatePositionDisplay(newX, newY);
            
            // Chỉ cập nhật lịch sử đường đi nếu đang ghi
            if (isRecording) {
                if (pathHistory.length > 0) {
                    const lastPos = pathHistory[pathHistory.length - 1];
                    const dist = calculateDistance(lastPos.x, lastPos.y, newX, newY);
                    
                    // Cập nhật tổng khoảng cách - điều chỉnh ngưỡng cho milimet
                    if (dist > 10) { // Bỏ qua thay đổi nhỏ dưới 10mm
                        totalDistance += dist;
                        document.getElementById('total-distance').textContent = (totalDistance).toFixed(0);
                        document.getElementById('path-points').textContent = pathHistory.length + 1;
                        
                        // Thêm vào lịch sử
                        addToPathHistory(newX, newY);
                    }
                } else {
                    // Điểm đầu tiên
                    addToPathHistory(newX, newY);
                    document.getElementById('path-points').textContent = '1';
                }
            }
            
            // Vẽ lại bản đồ
            drawMap();
        } else {
            console.log(`Map: Giá trị không hợp lệ hoặc vượt quá giới hạn - X=${newX}mm, Y=${newY}mm`);
        }
    } else {
        console.log("Map: Không tìm thấy giá trị encoderX hoặc encoderY trong dữ liệu");
    }
}

function safeParseFloat(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    
    // Loại bỏ các ký tự không phải số, dấu thập phân, dấu âm
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    return parseFloat(cleanValue);
}

// Mở rộng hàm getValueFromJson để tìm kiếm sâu hơn
function getValueFromJson(data, possibleNames) {
    // Kiểm tra cấp cao nhất
    for (const name of possibleNames) {
        if (data[name] !== undefined) {
            console.log(`Map: Tìm thấy ${name} ở cấp cao nhất:`, data[name]);
            return data[name];
        }
    }
    
    // Kiểm tra trong data.data (cấu trúc phổ biến)
    if (data.data && typeof data.data === 'object') {
        for (const name of possibleNames) {
            if (data.data[name] !== undefined) {
                console.log(`Map: Tìm thấy ${name} trong data.data:`, data.data[name]);
                return data.data[name];
            }
        }
    }
    
    // Kiểm tra trong các trường con cấp 1
    for (const key in data) {
        if (typeof data[key] === 'object' && data[key] !== null) {
            for (const name of possibleNames) {
                if (data[key][name] !== undefined) {
                    console.log(`Map: Tìm thấy ${name} trong ${key}:`, data[key][name]);
                    return data[key][name];
                }
            }
        }
    }
    
    console.log("Map: Không tìm thấy các trường sau trong dữ liệu:", possibleNames);
    return null;
}

// Tính khoảng cách giữa hai điểm
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Thêm vị trí vào lịch sử đường đi
function addToPathHistory(x, y) {
    pathHistory.push({ x, y });
    
    // Giới hạn số lượng điểm trong lịch sử
    if (pathHistory.length > PATH_HISTORY_MAX) {
        pathHistory.shift(); // Loại bỏ điểm cũ nhất
    }
    
    // Cập nhật số điểm
    document.getElementById('path-points').textContent = pathHistory.length;
}

// Cập nhật hiển thị vị trí
function updatePositionDisplay(x, y) {
    const posXElement = document.getElementById('position-x');
    const posYElement = document.getElementById('position-y');
    
    if (posXElement) posXElement.textContent = Math.round(x); // Làm tròn số nguyên cho mm
    if (posYElement) posYElement.textContent = Math.round(y); // Làm tròn số nguyên cho mm
}

// Cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('wifi-status');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = 'status';
        
        if (status === 'Connected') {
            statusElement.classList.add('connected');
        } else if (status === 'Disconnected' || status === 'Error') {
            statusElement.classList.add('disconnected');
        } else {
            statusElement.classList.add('connecting');
        }
    }
}

// Thay đổi kích thước canvas
function resizeCanvas() {
    const container = mapCanvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    
    mapCanvas.width = canvasWidth;
    mapCanvas.height = canvasHeight;
    
    // Tính tỷ lệ dựa trên kích thước và zoom
    updateScale();
    
    // Vẽ lại bản đồ
    drawMap();
}

// Cập nhật tỷ lệ khi thay đổi kích thước hoặc zoom
function updateScale() {
    scaleX = (canvasWidth / FIELD_WIDTH) * zoomLevel;
    scaleY = (canvasHeight / FIELD_HEIGHT) * zoomLevel;
}

// Thay đổi mức độ zoom
function changeZoom(factor) {
    zoomLevel *= factor;
    
    // Giới hạn zoom
    if (zoomLevel < 0.5) zoomLevel = 0.5;
    if (zoomLevel > 5) zoomLevel = 5;
    
    // Cập nhật tỷ lệ
    updateScale();
    
    // Vẽ lại bản đồ
    drawMap();
}

// Vẽ bản đồ
function drawMap() {
    if (!mapCtx) return;
    
    // Xóa canvas
    mapCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Lưu trạng thái
    mapCtx.save();
    
    // Áp dụng transform để zoom và pan
    mapCtx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
    mapCtx.scale(zoomLevel, zoomLevel);
    mapCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
    
    // Vẽ khung sân
    mapCtx.strokeStyle = '#333';
    mapCtx.lineWidth = 2;
    
    // Tính toán kích thước và vị trí của hình chữ nhật
    const fieldPixelWidth = FIELD_WIDTH * (canvasWidth / FIELD_WIDTH);
    const fieldPixelHeight = FIELD_HEIGHT * (canvasHeight / FIELD_HEIGHT);
    const fieldX = (canvasWidth - fieldPixelWidth) / 2;
    const fieldY = (canvasHeight - fieldPixelHeight) / 2;
    
    mapCtx.strokeRect(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Vẽ lưới
    drawGrid(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Vẽ lịch sử đường đi
    drawPathHistory(fieldX, fieldY);
    
    // Vẽ vị trí robot
    drawRobotPosition(fieldX, fieldY);
    
    // Khôi phục trạng thái
    mapCtx.restore();
    
    // Thêm thông báo về hệ toạ độ và đơn vị
    mapCtx.fillStyle = '#333';
    mapCtx.font = 'italic 10px Arial';
    mapCtx.fillText('*Gốc toạ độ (0,0) ở góc dưới bên phải. Đơn vị: milimet (mm)', fieldX + 5, fieldY + 15);
}

// Vẽ lưới
function drawGrid(fieldX, fieldY, fieldWidth, fieldHeight) {
    const gridSize = 1000; // 1000mm = 1m
    const pixelsPerMeterX = fieldWidth / FIELD_WIDTH;
    const pixelsPerMeterY = fieldHeight / FIELD_HEIGHT;
    
    // Vẽ lưới thường (mỏng)
    mapCtx.strokeStyle = '#ddd';
    mapCtx.lineWidth = 0.5;
    
    // Vẽ lưới dọc - với nhãn đảo ngược
    for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
        const pixelX = fieldX + x * pixelsPerMeterX;
        
        mapCtx.beginPath();
        mapCtx.moveTo(pixelX, fieldY);
        mapCtx.lineTo(pixelX, fieldY + fieldHeight);
        mapCtx.stroke();
        
        // Vẽ nhãn trục X - đảo ngược giá trị
        if (x % 5000 === 0 || x === FIELD_WIDTH) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            // Hiển thị giá trị đảo ngược (FIELD_WIDTH - x)
            mapCtx.fillText(`${(FIELD_WIDTH - x)}mm`, pixelX + 2, fieldY + fieldHeight - 2);
        }
    }
    
    // Vẽ lưới ngang - không thay đổi
    for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
        const pixelY = fieldY + y * pixelsPerMeterY;
        
        mapCtx.beginPath();
        mapCtx.moveTo(fieldX, pixelY);
        mapCtx.lineTo(fieldX + fieldWidth, pixelY);
        mapCtx.stroke();
        
        // Vẽ nhãn trục Y
        if (y % 5000 === 0 || y === FIELD_HEIGHT) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            mapCtx.fillText(`${y}mm`, fieldX + 2, pixelY - 2);
        }
    }
    
    // Vẽ đường trục chính giữa (đậm hơn và màu khác)
    mapCtx.strokeStyle = '#7b1fa2'; // Màu tím phù hợp với theme
    mapCtx.lineWidth = 1.5;
    
    // Đường dọc chính giữa (tại X = FIELD_WIDTH/2)
    const centerX = fieldX + (FIELD_WIDTH / 2) * pixelsPerMeterX;
    mapCtx.beginPath();
    mapCtx.moveTo(centerX, fieldY);
    mapCtx.lineTo(centerX, fieldY + fieldHeight);
    mapCtx.stroke();
    
    // Đường ngang chính giữa (tại Y = FIELD_HEIGHT/2)
    const centerY = fieldY + (FIELD_HEIGHT / 2) * pixelsPerMeterY;
    mapCtx.beginPath();
    mapCtx.moveTo(fieldX, centerY);
    mapCtx.lineTo(fieldX + fieldWidth, centerY);
    mapCtx.stroke();
    
    // Thêm nhãn cho đường chính giữa - điều chỉnh giá trị X
    mapCtx.fillStyle = '#7b1fa2';
    mapCtx.font = 'bold 10px Arial';
    mapCtx.fillText(`Giữa (${FIELD_WIDTH/2}mm)`, centerX + 3, fieldY + 12);
    mapCtx.fillText(`Giữa (${FIELD_HEIGHT/2}mm)`, fieldX + 3, centerY - 5);
}

// Vẽ lịch sử đường đi
function drawPathHistory(fieldX, fieldY) {
    if (pathHistory.length < 2) return;
    
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    mapCtx.strokeStyle = '#3498DB';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    
    // Điểm đầu tiên - chuyển đổi toạ độ X
    const startX = fieldX + (FIELD_WIDTH - pathHistory[0].x) * pixelsPerMeterX;
    const startY = fieldY + (FIELD_HEIGHT - pathHistory[0].y) * pixelsPerMeterY;
    mapCtx.moveTo(startX, startY);
    
    // Vẽ đường nối các điểm
    for (let i = 1; i < pathHistory.length; i++) {
        // Chuyển đổi toạ độ X
        const x = fieldX + (FIELD_WIDTH - pathHistory[i].x) * pixelsPerMeterX;
        const y = fieldY + (FIELD_HEIGHT - pathHistory[i].y) * pixelsPerMeterY;
        mapCtx.lineTo(x, y);
    }
    
    mapCtx.stroke();
}

// Vẽ vị trí robot
function drawRobotPosition(fieldX, fieldY) {
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    // Thay đổi cách tính toạ độ X - lấy từ bên phải
    const robotX = fieldX + (FIELD_WIDTH - robotPosition.x) * pixelsPerMeterX;
    const robotY = fieldY + (FIELD_HEIGHT - robotPosition.y) * pixelsPerMeterY;
    const radiusPixels = ROBOT_RADIUS * pixelsPerMeterX;
    
    // Vẽ hình tròn đại diện cho robot
    mapCtx.fillStyle = '#FF5733';
    mapCtx.beginPath();
    mapCtx.arc(robotX, robotY, radiusPixels, 0, Math.PI * 2);
    mapCtx.fill();
    
    // Vẽ dấu cộng tại tâm
    mapCtx.strokeStyle = '#fff';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(robotX - 5, robotY);
    mapCtx.lineTo(robotX + 5, robotY);
    mapCtx.moveTo(robotX, robotY - 5);
    mapCtx.lineTo(robotX, robotY + 5);
    mapCtx.stroke();
}

// Xóa lịch sử đường đi
function resetPath() {
    // Thêm xác nhận trước khi xóa
    if (pathHistory.length > 0) {
        const confirmReset = confirm('Are you sure you want to reset the path? This action cannot be undone.');
        if (!confirmReset) return;
    }
    
    pathHistory = [];
    totalDistance = 0;
    document.getElementById('path-points').textContent = '0';
    document.getElementById('total-distance').textContent = '0.00';
    drawMap();
    
    // Cập nhật trạng thái ghi
    if (isRecording) {
        stopRecording();
    }
}

// Căn giữa khung nhìn
function centerView() {
    offsetX = 0;
    offsetY = 0;
    zoomLevel = 1;
    updateScale();
    drawMap();
}

// Thêm các hàm điều khiển ghi
let isRecording = false;

function startRecording() {
    // Chỉ bắt đầu ghi nếu chưa ghi
    if (!isRecording) {
        isRecording = true;
        
        // Cập nhật UI
        document.getElementById('start-record-btn').disabled = true;
        document.getElementById('stop-record-btn').disabled = false;
        
        // Cập nhật chỉ báo trạng thái ghi
        const statusElement = document.querySelector('.recording-status');
        statusElement.classList.remove('inactive');
        statusElement.classList.add('active');
        statusElement.querySelector('.recording-text').textContent = 'Recording';
        
        console.log('Map: Recording started');
    }
}

function stopRecording() {
    // Chỉ dừng ghi nếu đang ghi
    if (isRecording) {
        isRecording = false;
        
        // Cập nhật UI
        document.getElementById('start-record-btn').disabled = false;
        document.getElementById('stop-record-btn').disabled = true;
        
        // Cập nhật chỉ báo trạng thái ghi
        const statusElement = document.querySelector('.recording-status');
        statusElement.classList.remove('active');
        statusElement.classList.add('inactive');
        statusElement.querySelector('.recording-text').textContent = 'Stopped';
        
        console.log('Map: Recording stopped');
    }
}

// Thêm hàm xuất ảnh từ canvas
function exportImage() {
    try {
        // Vẽ lại bản đồ với chất lượng cao
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = mapCanvas.width * 2; // Kích thước gấp đôi để chất lượng cao
        tempCanvas.height = mapCanvas.height * 2;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Áp dụng các transform tương tự như canvas gốc
        tempCtx.scale(2, 2); // Tăng độ phân giải
        tempCtx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
        tempCtx.scale(zoomLevel, zoomLevel);
        tempCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
        
        // Tính toán kích thước và vị trí của hình chữ nhật
        const fieldPixelWidth = FIELD_WIDTH * (canvasWidth / FIELD_WIDTH);
        const fieldPixelHeight = FIELD_HEIGHT * (canvasHeight / FIELD_HEIGHT);
        const fieldX = (canvasWidth - fieldPixelWidth) / 2;
        const fieldY = (canvasHeight - fieldPixelHeight) / 2;
        
        // Vẽ nền
        tempCtx.fillStyle = '#f0f0f0';
        tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Vẽ khung
        tempCtx.strokeStyle = '#333';
        tempCtx.lineWidth = 2;
        tempCtx.strokeRect(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
        
        // Vẽ lưới
        const pixelsPerMeterX = fieldPixelWidth / FIELD_WIDTH;
        const pixelsPerMeterY = fieldPixelHeight / FIELD_HEIGHT;
        
        tempCtx.strokeStyle = '#ddd';
        tempCtx.lineWidth = 0.5;
        
        // Vẽ lưới dọc và ngang - điều chỉnh cho milimet
        const gridSize = 1000; // 1000mm = 1m
        
        for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
            const pixelX = fieldX + x * pixelsPerMeterX;
            
            tempCtx.beginPath();
            tempCtx.moveTo(pixelX, fieldY);
            tempCtx.lineTo(pixelX, fieldY + fieldPixelHeight);
            tempCtx.stroke();
            
            // Vẽ nhãn X
            if (x % 5000 === 0 || x === FIELD_WIDTH) {
                tempCtx.fillStyle = '#666';
                tempCtx.font = '12px Arial';
                tempCtx.fillText(`${FIELD_WIDTH - x}mm`, pixelX + 2, fieldY + fieldPixelHeight - 4);
            }
        }
        
        for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
            const pixelY = fieldY + y * pixelsPerMeterY;
            tempCtx.beginPath();
            tempCtx.moveTo(fieldX, pixelY);
            tempCtx.lineTo(fieldX + fieldPixelWidth, pixelY);
            tempCtx.stroke();
            
            // Vẽ nhãn Y
            if (y % 5000 === 0 || y === FIELD_HEIGHT) {
                tempCtx.fillStyle = '#666';
                tempCtx.font = '12px Arial';
                tempCtx.fillText(`${y}mm`, fieldX + 4, pixelY - 4);
            }
        }
        
        // Vẽ đường trục chính giữa
        tempCtx.strokeStyle = '#7b1fa2'; // Màu tím phù hợp với theme
        tempCtx.lineWidth = 1.5;
        
        // Đường dọc chính giữa
        const centerX = fieldX + (FIELD_WIDTH / 2) * pixelsPerMeterX;
        tempCtx.beginPath();
        tempCtx.moveTo(centerX, fieldY);
        tempCtx.lineTo(centerX, fieldY + fieldPixelHeight);
        tempCtx.stroke();
        
        // Đường ngang chính giữa
        const centerY = fieldY + (FIELD_HEIGHT / 2) * pixelsPerMeterY;
        tempCtx.beginPath();
        tempCtx.moveTo(fieldX, centerY);
        tempCtx.lineTo(fieldX + fieldPixelWidth, centerY);
        tempCtx.stroke();
        
        // Thêm nhãn cho đường chính giữa
        tempCtx.fillStyle = '#7b1fa2';
        tempCtx.font = 'bold 12px Arial';
        tempCtx.fillText(`Giữa (${FIELD_WIDTH/2}mm)`, centerX + 5, fieldY + 16);
        tempCtx.fillText(`Giữa (${FIELD_HEIGHT/2}mm)`, fieldX + 5, centerY - 8);
        
        // VẼ ĐƯỜNG ĐI CỦA ROBOT (phần bị thiếu)
        if (pathHistory.length >= 2) {
            tempCtx.strokeStyle = '#3498DB';
            tempCtx.lineWidth = 3;
            tempCtx.beginPath();
            
            // Điểm đầu tiên
            const startX = fieldX + (FIELD_WIDTH - pathHistory[0].x) * pixelsPerMeterX;
            const startY = fieldY + (FIELD_HEIGHT - pathHistory[0].y) * pixelsPerMeterY;
            tempCtx.moveTo(startX, startY);
            
            // Vẽ đường nối các điểm
            for (let i = 1; i < pathHistory.length; i++) {
                const x = fieldX + (FIELD_WIDTH - pathHistory[i].x) * pixelsPerMeterX;
                const y = fieldY + (FIELD_HEIGHT - pathHistory[i].y) * pixelsPerMeterY;
                tempCtx.lineTo(x, y);
            }
            
            tempCtx.stroke();
            
            // Vẽ điểm bắt đầu và kết thúc
            tempCtx.fillStyle = '#27ae60'; // Màu xanh lá cho điểm bắt đầu
            tempCtx.beginPath();
            tempCtx.arc(startX, startY, 8, 0, Math.PI * 2);
            tempCtx.fill();
            
            // Điểm kết thúc
            const endX = fieldX + (FIELD_WIDTH - pathHistory[pathHistory.length-1].x) * pixelsPerMeterX;
            const endY = fieldY + (FIELD_HEIGHT - pathHistory[pathHistory.length-1].y) * pixelsPerMeterY;
            tempCtx.fillStyle = '#e74c3c'; // Màu đỏ cho điểm kết thúc
            tempCtx.beginPath();
            tempCtx.arc(endX, endY, 8, 0, Math.PI * 2);
            tempCtx.fill();
            
            // Thêm nhãn start và end
            tempCtx.fillStyle = '#000';
            tempCtx.font = '12px Arial';
            tempCtx.fillText('Start', startX + 10, startY);
            tempCtx.fillText('End', endX + 10, endY);
        }
        
        // VẼ VỊ TRÍ ROBOT HIỆN TẠI (phần bị thiếu)
        const robotX = fieldX + (FIELD_WIDTH - robotPosition.x) * pixelsPerMeterX;
        const robotY = fieldY + (FIELD_HEIGHT - robotPosition.y) * pixelsPerMeterY;
        const radiusPixels = ROBOT_RADIUS * pixelsPerMeterX;
        
        tempCtx.fillStyle = '#FF5733';
        tempCtx.beginPath();
        tempCtx.arc(robotX, robotY, radiusPixels, 0, Math.PI * 2);
        tempCtx.fill();
        
        // Vẽ dấu cộng tại tâm
        tempCtx.strokeStyle = '#fff';
        tempCtx.lineWidth = 3;
        tempCtx.beginPath();
        tempCtx.moveTo(robotX - 8, robotY);
        tempCtx.lineTo(robotX + 8, robotY);
        tempCtx.moveTo(robotX, robotY - 8);
        tempCtx.lineTo(robotX, robotY + 8);
        tempCtx.stroke();
        
        // Thêm chú thích - điều chỉnh cho milimet
        tempCtx.fillStyle = '#333';
        tempCtx.font = '14px Arial';
        tempCtx.fillText(`Total Distance: ${totalDistance.toFixed(0)}mm`, 10, 20);
        tempCtx.fillText(`Points: ${pathHistory.length}`, 10, 40);
        tempCtx.fillText(`Topic: ${currentSelectedTopic || 'ALL'}`, 10, 60);
        tempCtx.fillText(`Generated: ${new Date().toLocaleString()}`, 10, 80);
        tempCtx.fillText(`*Gốc toạ độ (0,0) ở góc dưới bên phải`, 10, 100);
        
        // Thêm chú giải màu sắc
        const legendY = 130;
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Chú thích:', 10, legendY);
        
        // Màu đường đi
        tempCtx.fillStyle = '#3498DB';
        tempCtx.fillRect(10, legendY + 10, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Đường đi', 35, legendY + 18);
        
        // Màu robot
        tempCtx.fillStyle = '#FF5733';
        tempCtx.fillRect(10, legendY + 30, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Vị trí robot', 35, legendY + 38);
        
        // Điểm bắt đầu
        tempCtx.fillStyle = '#27ae60';
        tempCtx.fillRect(10, legendY + 50, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Điểm bắt đầu', 35, legendY + 58);
        
        // Điểm kết thúc
        tempCtx.fillStyle = '#e74c3c';
        tempCtx.fillRect(10, legendY + 70, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Điểm kết thúc', 35, legendY + 78);
        
        // Tạo URL cho hình ảnh
        const imageURL = tempCanvas.toDataURL('image/png');
        
        // Tạo thẻ a để tải xuống
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = imageURL;
        a.download = `robot_path_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(imageURL);
        }, 100);
        
        console.log('Map: Image exported successfully');
    } catch (error) {
        console.error('Map: Error exporting image', error);
        alert('Failed to export image: ' + error.message);
    }
}

// Sửa đổi hàm export để hỗ trợ cả JSON và PNG
function exportPath() {
    // Chỉ xuất nếu có dữ liệu
    if (pathHistory.length === 0) {
        alert('No path data to export.');
        return;
    }
    
    // Hỏi người dùng muốn xuất loại file nào
    const exportType = confirm(
        'Choose export format:\nOK - Export as Image (PNG)\nCancel - Export as Data (JSON)'
    );
    
    if (exportType) {
        // Xuất PNG
        exportImage();
    } else {
        // Xuất JSON
        exportPathAsJSON();
    }
}

function exportPathAsJSON() {
    try {
        // Tạo đối tượng dữ liệu xuất
        const exportData = {
            timestamp: new Date().toISOString(),
            topic: currentSelectedTopic || 'ALL',
            totalDistance: totalDistance,
            unit: 'mm', // Làm rõ đơn vị là mm
            points: pathHistory.length,
            path: pathHistory
        };
        
        // Chuyển đổi đối tượng thành chuỗi JSON
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Tạo Blob và URL
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Tạo thẻ a để tải xuống
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `robot_path_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        
        // Thêm vào DOM, trigger click, và xóa
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log('Map: Path data exported successfully');
    } catch (error) {
        console.error('Map: Error exporting path data', error);
        alert('Failed to export path data: ' + error.message);
    }
}