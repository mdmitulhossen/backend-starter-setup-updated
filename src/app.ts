import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import { StatusCodes } from "http-status-codes";
import { MongoClient } from "mongodb";
import morgan from "morgan";
import NodeCache from "node-cache";
import path from "path";
import swaggerUi from "swagger-ui-express";
import GlobalErrorHandler from "./app/middleware/globalErrorHandler";
import { applySecurityMiddleware } from "./app/middleware/security";
import { healthRouter } from "./app/modules/health/health.routes";
import router from "./app/route/route";
import config from "./config";
import { swaggerSpec, swaggerUiOptions } from "./config/swaggerConfig";
import logger, { morganStream } from "./utils/logger";

export const myCache = new NodeCache({ stdTTL: 300 });
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set("trust proxy", 1);

export const corsOptions = {
  origin: config.isProduction
    ? [process.env.CLIENT_URL || "https://yourdomain.com"]
    : ["http://localhost:3000", "http://localhost:5173", "*"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Apply security middleware
applySecurityMiddleware(app);

// Request logging with Morgan + Winston
app.use(morgan("combined", { stream: morganStream }));

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.json({
    success: true,
    title: `${process.env.CLIENT_NAME} API`,
    message: "Hello World!",
  });
});

const uploadPath = path.join(__dirname, "..", "uploads");

// Ensure uploads folder exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log("Uploads folder created successfully!");
}

app.use("/uploads", express.static(uploadPath));

const connectDB = async () => {
  try {
    const conn = await new MongoClient(config.DATABASE_URL).connect();
    logger.info("✅ MongoDB Connected Successfully");
  } catch (error: any) {
    logger.error("❌ MongoDB Connection Error:", error?.message);
    throw error;
  }
};

connectDB();

// Health check routes
app.use(healthRouter);

// API routes
app.use("/api/v1", router);

// API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions)
);

// Global error handler
app.use(GlobalErrorHandler);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
