# BabyTools - Extension tích hợp cho Cocos Creator

Extension này tích hợp 2 công cụ tiện ích cho dự án Cocos Creator:

## 🛠️ Các công cụ có sẵn:

### 1. 🖼️ Tiny Image
- **Chức năng**: Tự động tối ưu hóa hình ảnh PNG/JPG bằng TinyPNG API
- **Vị trí menu**: `Extension > BabyTools > Tiny Image`
- **Tính năng**:
  - Chọn folder để tối ưu hóa
  - Hiển thị log chi tiết quá trình xử lý
  - Tự động mở folder chứa ảnh đã tối ưu
  - Hiển thị thống kê tiết kiệm dung lượng

### 2. 🧹 Check Unused Assets  
- **Chức năng**: Kiểm tra và quản lý các asset chưa được sử dụng trong dự án
- **Vị trí menu**: `Extension > BabyTools > Check Unused Assets`
- **Tính năng**:
  - Quét folder để tìm asset chưa dùng
  - Hiển thị kết quả dạng tree view
  - Có thể di chuyển asset chưa dùng vào folder tạm
  - Khôi phục hoặc xóa vĩnh viễn asset từ folder tạm
  - Hỗ trợ dependencies (skeleton, font)

## 📁 Cấu trúc Extension:

```
baby-tools/
├── main.js                    # Entry point
├── package.json               # Cấu hình extension
└── panels/
    ├── tiny-image/           # Panel TinyPNG
    │   ├── index.html
    │   └── index.js
    └── check-unused-assets/  # Panel Check Assets
        ├── panel.html
        ├── panel.css
        └── panel.js
```

## 🚀 Cài đặt:

1. Copy folder `baby-tools` vào thư mục `extensions/` của dự án
2. Restart Cocos Creator
3. Truy cập menu `Extension > BabyTools` để sử dụng các công cụ

## ⚙️ Cấu hình:

### Tiny Image:
- Cần API key từ [tinypng.com/developers](https://tinypng.com/developers)  
- Thay đổi API key trong file `panels/tiny-image/index.js`:
```javascript
tinify.key = 'YOUR_API_KEY_HERE';
```

### Check Unused Assets:
- Không cần cấu hình thêm
- Tự động hoạt động với database asset của Cocos Creator

## 🔄 Migration từ extension cũ:

Extension này thay thế cho 2 extension riêng biệt:
- `tiny-auto` → `BabyTools > Tiny Image`
- `check-unused-assets` → `BabyTools > Check Unused Assets`

Có thể xóa 2 extension cũ sau khi đã cài đặt `baby-tools`.

## 📝 Lưu ý:

- Extension yêu cầu Node.js dependencies: `tinify`
- Backup dự án trước khi sử dụng chức năng di chuyển/xóa asset
- Kiểm tra kỹ kết quả scan trước khi thực hiện các thao tác không thể hoàn tác