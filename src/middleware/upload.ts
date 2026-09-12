import multer from "multer";

const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
  "application/csv",
]);

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !/\.(xlsx|csv)$/i.test(file.originalname)) {
      cb(new Error("Only .xlsx or .csv files are accepted"));
      return;
    }
    cb(null, true);
  },
});
