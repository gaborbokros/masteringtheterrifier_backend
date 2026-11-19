import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';

const router = Router();
const collectionName = 'formSubmissions';

router.use(rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
}));

router.use((_req, res, next) => {
	res.set('Cache-Control', 'no-store');
	next();
});

router.post('/', async (req, res, next) => {
	const configuredPassword = process.env.ADMIN_PASSWORD;
	if (!configuredPassword) {
		return res.status(503).json({ error: 'Az admin hozzáférés nincs beállítva.' });
	}

	const suppliedPassword = req.body?.password;
	if (typeof suppliedPassword !== 'string' || suppliedPassword.length === 0) {
		return res.status(401).json({ error: 'Hibás jelszó.' });
	}

	const suppliedDigest = createHash('sha256').update(suppliedPassword).digest();
	const configuredDigest = createHash('sha256').update(configuredPassword).digest();
	if (!timingSafeEqual(suppliedDigest, configuredDigest)) {
		return res.status(401).json({ error: 'Hibás jelszó.' });
	}

	if (!req.db) {
		return res.status(503).json({ error: 'Az adatbázis jelenleg nem érhető el.' });
	}

	try {
		const submissions = await req.db.collection(collectionName).find({}).toArray();
		const contestants = submissions.map(({ _id, ...data }) => ({
			id: _id.toString(),
			...data,
		}));
		return res.json({ count: contestants.length, contestants });
	} catch (error) {
		return next(error);
	}
});

export default router;