import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { closeDatabase, connectToDatabase } from './db/mongo.js';
import adminRoutes from './routes/admin.js';
import editFormRoutes from './routes/editForms.js';
import formRoutes from './routes/forms.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
 
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('PORT must be an integer between 1 and 65535.');
}
 
app.disable('x-powered-by');

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy && trustProxy !== '0') {
	const proxyHops = Number(trustProxy);
	if (!Number.isInteger(proxyHops) || proxyHops < 1) {
		throw new Error('TRUST_PROXY must be 0 or a positive integer.');
	}
	app.set('trust proxy', proxyHops);
}

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use((req, _res, next) => {
	req.db = req.app.locals.db;
	next();
});

app.get('/healthz', (_req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.use(rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 100,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
}));

app.use('/api/forms', formRoutes);
app.use('/api/forms/:submissionId/edit', editFormRoutes);
app.use('/api/admin/forms', adminRoutes);

app.get('/', (_req, res) => {
	res.json({ name: 'masteringtheterrifier_backend', status: 'running' });
});

app.use((_req, res) => {
	res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
	const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
		? err.status
		: 500;
	if (status === 500) {
		console.error(err);
	}
	res.status(status).json({
		error: status === 500 ? 'Internal server error' : err.message,
	});
});

const isMainModule = process.argv[1]
	&& path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
	const startServer = async () => {
		app.locals.db = await connectToDatabase();
		const server = app.listen(port, host, () => {
			console.log(`Server listening on http://${host}:${port}`);
		});

		const shutdown = (signal) => {
			console.log(`${signal} received; closing HTTP server.`);
			server.close(async () => {
				await closeDatabase();
				process.exit(0);
			});
		};

		process.once('SIGINT', () => shutdown('SIGINT'));
		process.once('SIGTERM', () => shutdown('SIGTERM'));
	};

	startServer().catch((error) => {
		console.error('Failed to start server:', error.message);
		process.exitCode = 1;
	});
}

export default app;
