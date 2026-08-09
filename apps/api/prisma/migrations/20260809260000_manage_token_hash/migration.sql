-- manageToken deixa de usar default cuid() no banco.
-- Novos bookings gravam SHA-256(raw) via aplicação; links legados (cuid/md5) continuam
-- resolvíveis por dual-read em findByManageToken até rotação natural.
ALTER TABLE "appointments" ALTER COLUMN "manageToken" DROP DEFAULT;
