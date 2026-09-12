import multer from "multer";

export const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.json$/i.test(file.originalname) && file.mimetype !== "application/json") {
      cb(new Error("Only a .json backup file is accepted"));
      return;
    }
    cb(null, true);
  },
});
