import express from 'express';
import { registerApiRoutes } from '../apiRoutes.js';
import { registerBootstrapRoutes } from '../bootstrapRoutes.js';
import { legacyIdGuard } from '../legacyIdGuard.js';

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(legacyIdGuard);
registerBootstrapRoutes(app);
registerApiRoutes(app);

export default app;
