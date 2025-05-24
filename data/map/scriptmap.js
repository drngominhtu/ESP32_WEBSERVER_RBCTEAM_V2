/**
 * Script để vẽ bản đồ vị trí robot
 * Theo dõi vị trí encoder của robot dựa trên EncoderX và EncoderY
 * Sử dụng dữ liệu đã được xử lý từ script chính
 */

// Khai báo biến toàn cục
let ctx;
let canvas;
let canvasWidth;
let canvasHeight;
const FIELD_WIDTH = 15; // Chiều rộng thực tế 15m
const FIELD_HEIGHT = 8; // Chiều cao thực tế 8m
const ROBOT_RADIUS = 0.4; // Bán kính robot 0.4m
const PATH_HISTORY_MAX = 1000; // Số điểm tối đa trong lịch sử đường đi
let scaleX, scaleY;
let offsetX = 0, offsetY = 0;

// Vị trí robot và lịch sử đường đi
let robotPosition = { x: 0, y: 0, color: '#FF5733', updated: false };
let pathHistory = [];

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    // Lấy canvas và context
    canvas = document.getElementById('position-map');
    if (!canvas) {
        console.error('Canvas not found');
        return;
    }
    
    ctx = canvas.getContext('2d');
    
    // Thiết lập kích thước canvas
    resizeCanvas();
    
    // Theo dõi sự kiện resize
    window.addEventListener('resize', resizeCanvas);
    
    // Lấy thông tin kết nối từ script chính
    updateConnectionFromMainScript();
    
    // Vẽ bản đồ ban đầu
    drawMap();
    
    // Cập nhật bản đồ liên tục
    setInterval(updateMap, 50);
    
    // Thiết lập sự kiện cho các nút điều khiển
    document.getElementById('reset-btn').addEventListener('click', resetPath);
    document.getElementById('center-btn').addEventListener('click', centerView);
    
    // Đăng ký lắng nghe sự kiện dữ liệu mới từ script chính
    window.addEventListener('mqtt-data-received', handleNewData);
});

// Cập nhật thông tin kết nối từ script chính
function updateConnectionFromMainScript() {
    try {
        // Kiểm tra xem biến toàn cục từ script chính có tồn tại không
        const status = window.connectionStatus || 'Unknown';
        const ipAddress = window.location.hostname || '192.168.5.1';
        
        // Cập nhật UI
        document.getElementById('ip-address').textContent = ipAddress;
        updateConnectionStatus(status);
        
        // Kiểm tra lại sau 5 giây
        setTimeout(updateConnectionFromMainScript, 5000);
    } catch (error) {
        console.error('Error updating connection info:', error);
        updateConnectionStatus('Error');
    }
}

// Cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
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

// Xử lý dữ liệu mới từ script chính
function handleNewData(event) {
    try {
        // Lấy dữ liệu từ custom event
        const data = event.detail;
        processPositionData(data);
    } catch (error) {
        console.error('Error handling new data:', error);
    }
}

// Vì không kết nối WebSocket trực tiếp, chúng ta cần thêm một hàm để script chính có thể gọi
window.updateMapData = function(data) {
    // Xử lý dữ liệu vị trí từ script chính
    processPositionData(data);
};

// Xử lý dữ liệu vị trí
function processPositionData(data) {
    if (!data) return;
    
    // Kiểm tra nếu có dữ liệu encoder
    // Chú ý: tên trường có thể khác tùy thuộc vào định dạng JSON từ robot
    const encoderX = data.encoderX || data.EncoderX || data.positionX || data.PositionX || data.x || 0;
    const encoderY = data.encoderY || data.EncoderY || data.positionY || data.PositionY || data.y || 0;
    
    // Nếu tìm thấy dữ liệu vị trí
    if (encoderX !== undefined && encoderY !== undefined) {
        // Cập nhật vị trí robot
        const x = parseFloat(encoderX);
        const y = parseFloat(encoderY);
        
        // Kiểm tra giá trị hợp lệ
        if (!isNaN(x) && !isNaN(y)) {
            robotPosition.x = x;
            robotPosition.y = y;
            robotPosition.updated = true;
            
            // Cập nhật hiển thị vị trí
            updatePositionDisplay(robotPosition.x, robotPosition.y);
            
            // Thêm vị trí hiện tại vào lịch sử đường đi
            addToPathHistory(robotPosition.x, robotPosition.y);
        }
    }
}

// Thêm vị trí vào lịch sử đường đi
function addToPathHistory(x, y) {
    // Thêm vị trí mới
    pathHistory.push({ x, y });
    
    // Giới hạn số lượng điểm lưu trữ
    if (pathHistory.length > PATH_HISTORY_MAX) {
        pathHistory.shift(); // Loại bỏ điểm cũ nhất
    }
}

// Cập nhật hiển thị vị trí
function updatePositionDisplay(x, y) {
    const posXElement = document.getElementById('position-x');
    const posYElement = document.getElementById('position-y');
    
    if (posXElement && posYElement) {
        posXElement.textContent = x.toFixed(2);
        posYElement.textContent = y.toFixed(2);
    }
}

// Vẽ bản đồ
function drawMap() {
    if (!ctx) return;
    
    // Xóa canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Vẽ khung sân
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    
    // Vẽ lưới
    drawGrid();
    
    // Vẽ lịch sử đường đi
    drawPathHistory();
    
    // Vẽ vị trí robot
    drawRobotPosition();
}

// Hàm thay đổi kích thước canvas
function resizeCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Tính tỷ lệ để vẽ đúng kích thước
    scaleX = canvasWidth / FIELD_WIDTH;
    scaleY = canvasHeight / FIELD_HEIGHT;
    
    // Cập nhật thông tin tỷ lệ
    document.getElementById('scale-value').textContent = `1:${(FIELD_WIDTH / canvasWidth).toFixed(2)}`;
    
    // Vẽ lại bản đồ sau khi thay đổi kích thước
    drawMap();
}

// Vẽ lưới
function drawGrid() {
    const gridSize = 1; // Khoảng cách lưới 1m
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    
    // Vẽ lưới dọc
    for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
        const pixelX = x * scaleX;
        ctx.beginPath();
        ctx.moveTo(pixelX, 0);
        ctx.lineTo(pixelX, canvasHeight);
        ctx.stroke();
        
        // Vẽ nhãn trục X
        if (x % 5 === 0 || x === FIELD_WIDTH) { // Vẽ nhãn cho mỗi 5m và đầu/cuối
            ctx.fillStyle = '#666';
            ctx.font = '10px Arial';
            ctx.fillText(`${x}m`, pixelX + 2, canvasHeight - 2);
        }
    }
    
    // Vẽ lưới ngang
    for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
        const pixelY = y * scaleY;
        ctx.beginPath();
        ctx.moveTo(0, pixelY);
        ctx.lineTo(canvasWidth, pixelY);
        ctx.stroke();
        
        // Vẽ nhãn trục Y
        if (y % 5 === 0 || y === FIELD_HEIGHT) { // Vẽ nhãn cho mỗi 5m và đầu/cuối
            ctx.fillStyle = '#666';
            ctx.font = '10px Arial';
            ctx.fillText(`${y}m`, 2, canvasHeight - pixelY - 2);
        }
    }
}

// Vẽ lịch sử đường đi
function drawPathHistory() {
    if (pathHistory.length < 2) return;
    
    ctx.strokeStyle = '#3498DB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const startPoint = worldToCanvas(pathHistory[0].x, pathHistory[0].y);
    ctx.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < pathHistory.length; i++) {
        const point = worldToCanvas(pathHistory[i].x, pathHistory[i].y);
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.stroke();
}

// Vẽ vị trí robot
function drawRobotPosition() {
    if (!robotPosition.updated) return;
    
    const pos = worldToCanvas(robotPosition.x, robotPosition.y);
    
    // Vẽ hình tròn đại diện cho robot
    ctx.fillStyle = robotPosition.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ROBOT_RADIUS * scaleX, 0, Math.PI * 2);
    ctx.fill();
    
    // Vẽ dấu cộng tại tâm
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x - 5, pos.y);
    ctx.lineTo(pos.x + 5, pos.y);
    ctx.moveTo(pos.x, pos.y - 5);
    ctx.lineTo(pos.x, pos.y + 5);
    ctx.stroke();
}

// Chuyển đổi từ tọa độ thế giới sang tọa độ canvas
function worldToCanvas(x, y) {
    // Chuyển đổi tọa độ và áp dụng offset
    const canvasX = x * scaleX + offsetX;
    
    // Lật trục Y vì canvas có gốc ở góc trên trái
    const canvasY = canvasHeight - (y * scaleY) + offsetY;
    
    return { x: canvasX, y: canvasY };
}

// Cập nhật bản đồ
function updateMap() {
    if (robotPosition.updated) {
        drawMap();
    }
}

// Xóa lịch sử đường đi
function resetPath() {
    pathHistory = [];
    drawMap();
}

// Căn giữa khung nhìn vào vị trí hiện tại
function centerView() {
    // Đặt lại offset
    offsetX = 0;
    offsetY = 0;
    drawMap();
}