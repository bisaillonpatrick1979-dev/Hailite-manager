import express from 'express';
import { registerApiRoutes } from '../apiRoutes.js';
import { registerBootstrapRoutes } from '../bootstrapRoutes.js';
import { legacyIdGuard } from '../legacyIdGuard.js';
import { apiErrorHandler, registerSecurityMiddleware } from '../securityMiddleware.js';

const app = express();
registerSecurityMiddleware(app);
app.use(express.json({ limit: '8mb' }));
app.use(legacyIdGuard);
registerBootstrapRoutes(app);
registerApiRoutes(app);
app.use(apiErrorHandler);

export default app;
