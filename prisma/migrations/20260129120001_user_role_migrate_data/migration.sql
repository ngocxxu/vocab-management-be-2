-- Chuyển dữ liệu (sau khi MEMBER, GUEST đã có trong enum)
UPDATE "user" SET role = 'MEMBER' WHERE role = 'STAFF';
UPDATE "user" SET role = 'GUEST' WHERE role = 'CUSTOMER';

-- Cập nhật default cho cột role
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'GUEST';
