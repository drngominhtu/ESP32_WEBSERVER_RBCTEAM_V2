import paho.mqtt.client as mqtt
import json
import time
import random
import math
from datetime import datetime

# Cấu hình MQTT - Fixed topic
MQTT_BROKER = "192.168.5.1"  # Thay đổi thành địa chỉ broker của bạn
MQTT_PORT = 1883
MQTT_TOPIC = "Robot1/data"  # Fixed topic
MQTT_USERNAME = None  # Thêm username nếu cần
MQTT_PASSWORD = None  # Thêm password nếu cần

# Cấu hình dữ liệu
FIELD_WIDTH = 15000  # 15000mm = 15m2
FIELD_HEIGHT = 8000  # 8000mm = 8m
UPDATE_INTERVAL = 0.05  # Gửi dữ liệu mỗi 0.5 giây

class RobotDataSimulator:
    def __init__(self):
        self.client = mqtt.Client()
        self.connected = False
        
        # Vị trí encoder - đảm bảo không âm và trong giới hạn
        self.encoder_x = random.uniform(1000, FIELD_WIDTH - 1000)  # Giữ cách biên 1m
        self.encoder_y = random.uniform(1000, FIELD_HEIGHT - 1000)
        
        # Vận tốc di chuyển
        self.velocity_x = random.uniform(-200, 200)  # mm/s
        self.velocity_y = random.uniform(-200, 200)  # mm/s
        
        # Các thông số khác
        self.imu_value = random.uniform(0, 180)  # IMU angle
        self.speed_value = random.uniform(0, 10)  # Speed
        self.project_env = random.uniform(0, 100)  # Project environment
        self.toolchain_bin = random.uniform(0, 20)  # Toolchain binary
        self.internal_console = random.uniform(0, 50)  # Internal console
        
        # Random walk parameters
        self.direction_change_time = 0
        self.direction_change_interval = random.uniform(2, 5)  # giây
        
        # Thiết lập callback
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_publish = self.on_publish
        
        # Thiết lập authentication nếu cần
        if MQTT_USERNAME and MQTT_PASSWORD:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    
    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            print(f"✅ Đã kết nối thành công đến MQTT broker: {MQTT_BROKER}:{MQTT_PORT}")
            print(f"📡 Topic: {MQTT_TOPIC}")
            print(f"🔄 Interval: {UPDATE_INTERVAL}s")
            print(f"📍 Vị trí ban đầu: X={self.encoder_x:.1f}mm, Y={self.encoder_y:.1f}mm")
        else:
            print(f"❌ Không thể kết nối đến MQTT broker. Code: {rc}")
    
    def on_disconnect(self, client, userdata, rc):
        self.connected = False
        print("❌ Mất kết nối MQTT")
    
    def on_publish(self, client, userdata, mid):
        pass  # Có thể thêm log nếu cần
    
    def connect(self):
        try:
            print(f"🔄 Đang kết nối đến {MQTT_BROKER}:{MQTT_PORT}...")
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
            
            # Đợi kết nối
            timeout = 10
            while not self.connected and timeout > 0:
                time.sleep(0.1)
                timeout -= 0.1
            
            if not self.connected:
                raise Exception("Timeout khi kết nối")
                
        except Exception as e:
            print(f"❌ Lỗi kết nối: {e}")
            return False
        return True
    
    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
    
    def update_random_velocity(self, dt):
        """Cập nhật vận tốc ngẫu nhiên"""
        # Thay đổi hướng ngẫu nhiên theo thời gian
        self.direction_change_time += dt
        
        if self.direction_change_time >= self.direction_change_interval:
            # Thay đổi vận tốc ngẫu nhiên
            speed = random.uniform(50, 300)  # mm/s
            direction = random.uniform(0, 2 * math.pi)  # radians
            
            self.velocity_x = speed * math.cos(direction)
            self.velocity_y = speed * math.sin(direction)
            
            # Reset timer với interval ngẫu nhiên mới
            self.direction_change_time = 0
            self.direction_change_interval = random.uniform(1, 6)
        
        # Thêm nhiễu ngẫu nhiên vào vận tốc
        noise_x = random.uniform(-20, 20)
        noise_y = random.uniform(-20, 20)
        
        actual_vx = self.velocity_x + noise_x
        actual_vy = self.velocity_y + noise_y
        
        return actual_vx, actual_vy
    
    def update_encoder_position(self, dt):
        """Cập nhật vị trí encoder với ràng buộc không âm và < 15000"""
        # Lấy vận tốc ngẫu nhiên
        vx, vy = self.update_random_velocity(dt)
        
        # Tính vị trí mới
        new_x = self.encoder_x + vx * dt
        new_y = self.encoder_y + vy * dt
        
        # Kiểm tra và bounce nếu chạm biên
        if new_x <= 0 or new_x >= FIELD_WIDTH:
            self.velocity_x = -self.velocity_x * random.uniform(0.7, 1.0)
            new_x = max(50, min(FIELD_WIDTH - 50, new_x))  # Giữ cách biên 50mm
        
        if new_y <= 0 or new_y >= FIELD_HEIGHT:
            self.velocity_y = -self.velocity_y * random.uniform(0.7, 1.0)
            new_y = max(50, min(FIELD_HEIGHT - 50, new_y))
        
        # Đảm bảo encoder không âm và không vượt quá giới hạn
        self.encoder_x = max(0, min(FIELD_WIDTH - 1, new_x))
        self.encoder_y = max(0, min(FIELD_HEIGHT - 1, new_y))
    
    def update_other_values(self, dt):
        """Cập nhật các giá trị khác với random walk"""
        # IMU - random walk trong khoảng 0-180
        imu_change = random.uniform(-5, 5)
        self.imu_value += imu_change
        self.imu_value = max(0, min(180, self.imu_value))
        
        # Speed - random walk trong khoảng 0-10
        speed_change = random.uniform(-0.5, 0.5)
        self.speed_value += speed_change
        self.speed_value = max(0, min(10, self.speed_value))
        
        # Project Environment - random walk 0-100
        env_change = random.uniform(-2, 2)
        self.project_env += env_change
        self.project_env = max(0, min(100, self.project_env))
        
        # Toolchain Binary - random walk 0-20
        toolchain_change = random.uniform(-0.5, 0.5)
        self.toolchain_bin += toolchain_change
        self.toolchain_bin = max(0, min(20, self.toolchain_bin))
        
        # Internal Console - random walk 0-50
        console_change = random.uniform(-1, 1)
        self.internal_console += console_change
        self.internal_console = max(0, min(50, self.internal_console))
    
    def create_json_data(self):
        """Tạo dữ liệu JSON với format yêu cầu"""
        
        # Tạo JSON với đúng format và tên trường như yêu cầu
        data = {
            "encoderX": f"{self.encoder_x:.1f}",
            "encoderY": f"{self.encoder_y:.1f}",
            "imu": f"{self.imu_value:.1f}",
            "speed": f"{self.speed_value:.1f}",
            "projectEnvName": f"{self.project_env:.0f}",
            "toolchainBinDir": f"{self.toolchain_bin:.1f}",
            "internalConsoleOptions": f"{self.internal_console:.1f}"
        }
        
        return data
    
    def publish_data(self):
        """Publish dữ liệu lên MQTT broker"""
        if not self.connected:
            return False
        
        try:
            data = self.create_json_data()
            json_string = json.dumps(data, indent=4)
            
            # Use fixed topic Robot1/data
            result = self.client.publish(MQTT_TOPIC, json_string)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                # Parse lại để hiển thị
                encoder_x = float(data["encoderX"])
                encoder_y = float(data["encoderY"])
                speed = float(data["speed"])
                imu = float(data["imu"])
                
                print(f"📤 [X:{encoder_x:7.1f}mm, Y:{encoder_y:7.1f}mm] "
                      f"Speed: {speed:4.1f}, IMU: {imu:5.1f}°, "
                      f"Env: {data['projectEnvName']}, "
                      f"Tool: {data['toolchainBinDir']}")
                return True
            else:
                print(f"❌ Lỗi publish: {result.rc}")
                return False
                
        except Exception as e:
            print(f"❌ Lỗi tạo/gửi dữ liệu: {e}")
            return False
    
    def run_simulation(self, duration=None):
        """Chạy simulation với random updates"""
        print(f"🚀 Bắt đầu simulation với JSON format yêu cầu")
        print(f"📍 Vị trí ban đầu: X={self.encoder_x:.1f}mm, Y={self.encoder_y:.1f}mm")
        print(f"📋 Ràng buộc: Encoder X,Y >= 0 và < 15000mm")
        print("📋 Commands: Ctrl+C để dừng")
        print("-" * 80)
        
        start_time = time.time()
        last_update = start_time
        
        try:
            while True:
                current_time = time.time()
                dt = current_time - last_update
                
                # Cập nhật tất cả thông số với random
                self.update_encoder_position(dt)
                self.update_other_values(dt)
                
                # Publish dữ liệu
                self.publish_data()
                
                last_update = current_time
                
                # Kiểm tra thời gian chạy
                if duration and (current_time - start_time) > duration:
                    break
                
                # Fixed sleep time
                time.sleep(UPDATE_INTERVAL)
                
        except KeyboardInterrupt:
            print("\n🛑 Dừng simulation bởi người dùng")
        except Exception as e:
            print(f"\n❌ Lỗi trong simulation: {e}")

def test_json_format():
    """Test để kiểm tra format JSON"""
    simulator = RobotDataSimulator()
    
    print("🧪 Test JSON Format:")
    print("=" * 40)
    
    # Tạo 5 mẫu JSON để kiểm tra
    for i in range(5):
        simulator.update_encoder_position(0.5)
        simulator.update_other_values(0.5)
        
        data = simulator.create_json_data()
        json_string = json.dumps(data, indent=4)
        
        print(f"Sample {i+1}:")
        print(json_string)
        print("-" * 40)
        
        # Kiểm tra ràng buộc
        encoder_x = float(data["encoderX"])
        encoder_y = float(data["encoderY"])
        
        print(f"✅ EncoderX: {encoder_x:.1f} ({'✓' if 0 <= encoder_x < 15000 else '✗'})")
        print(f"✅ EncoderY: {encoder_y:.1f} ({'✓' if 0 <= encoder_y < 8000 else '✗'})")
        print("=" * 40)

if __name__ == "__main__":
    print("🤖 Robot1 Data Simulator - Custom JSON Format")
    print("=" * 60)
    
    # Kiểm tra các thông số
    print(f"📡 MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"📋 Topic: {MQTT_TOPIC} (Fixed)")
    print(f"📐 Field Size: {FIELD_WIDTH}x{FIELD_HEIGHT}mm")
    print(f"⏱️  Update Interval: {UPDATE_INTERVAL}s")
    print(f"📝 JSON Format: Custom với các trường cố định")
    print()
    
    # Cho phép người dùng chọn test hoặc run
    choice = input("Chọn chế độ:\n1. Test JSON Format\n2. Run Simulation\nNhập 1 hoặc 2: ").strip()
    
    if choice == "1":
        test_json_format()
    else:
        # Khởi tạo và chạy simulator
        simulator = RobotDataSimulator()
        
        if simulator.connect():
            simulator.run_simulation()
            simulator.disconnect()
        
        print("👋 Kết thúc simulation")