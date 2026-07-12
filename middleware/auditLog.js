// middleware/auditLog.js
//
// Appends a one-line JSON entry to logs/audit.log for every admin write operation.
// Mount AFTER verifyAdmin so req.admin is populated.
//
import fs from "fs";
import path from "path";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const auditStream = fs.createWriteStream(path.join(logDir, "audit.log"), { flags: "a" });

export function auditLog(action) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const statusCode = res.statusCode;
      // Only log when the operation succeeds (2xx)
      if (statusCode >= 200 && statusCode < 300) {
        const entry = {
          ts: new Date().toISOString(),
          action,
          adminId: req.admin?._id?.toString() || "unknown",
          adminEmail: req.admin?.email || "unknown",
          method: req.method,
          path: req.originalUrl,
          params: req.params,
          ip: req.ip,
          status: statusCode,
        };
        auditStream.write(JSON.stringify(entry) + "\n");
      }
      return originalJson(body);
    };

    next();
  };
}
