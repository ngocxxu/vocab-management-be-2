-- Chỉ thêm giá trị mới (dùng trong migration tiếp theo sau khi commit)
ALTER TYPE "UserRole" ADD VALUE 'MEMBER';
ALTER TYPE "UserRole" ADD VALUE 'GUEST';
